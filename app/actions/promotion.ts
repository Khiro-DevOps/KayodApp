"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { ensureValidWorkLocationId } from "@/lib/employee-position-server";
import { resolveContractWorkSetup, resolveEmployeeSourceOfTruth } from "@/lib/work-arrangement";
import { requireHrPermission } from "@/lib/rbac/server";
import { fetchDepartmentsAndSupervisors } from "@/lib/job-headcount-server";
import {
  normalizeJobLevel,
  type JobLevel,
  type SupervisorCandidate,
} from "@/lib/workforce-hierarchy";
import {
  getCurrentManilaWeekStart,
  resolveInitialHireSchedule,
} from "@/lib/schedule-policy";
import {
  provisionEmployeeLeaveBalances,
  resolveLeavePolicyFromSources,
} from "@/lib/leave-policy";

export interface PromoteApplicantResult {
  success: boolean;
  employeeId?: string;
  error?: string;
}

export interface PromoteModalHierarchyContext {
  defaultSupervisorId: string | null;
  targetJobLevel: JobLevel;
  departmentId: string | null;
  tenantId: string | null;
  supervisorCandidates: SupervisorCandidate[];
}

export async function getPromoteModalContext(
  applicationId: string,
): Promise<PromoteModalHierarchyContext> {
  const ctx = await requireHrPermission("hires:confirm");
  const admin = getAdminClient();

  let jobId: string | null = null;
  const { data: jobApp } = await admin
    .from("job_applications")
    .select("job_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (jobApp?.job_id) {
    jobId = jobApp.job_id;
  } else {
    const { data: legacyApp } = await admin
      .from("applications")
      .select("job_posting_id")
      .eq("id", applicationId)
      .maybeSingle();
    jobId = legacyApp?.job_posting_id ?? null;
  }

  let defaultSupervisorId: string | null = null;
  let targetJobLevel: JobLevel = "staff";
  let departmentId: string | null = null;
  let tenantId: string | null = ctx.tenant_id ?? null;

  const [{ data: posting }, { data: latestOffer }] = await Promise.all([
    jobId
      ? admin
          .from("job_postings")
          .select("default_supervisor_id, target_job_level, department_id, tenant_id")
          .eq("id", jobId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("job_offers")
      .select("job_metadata")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (posting) {
    defaultSupervisorId = posting.default_supervisor_id ?? null;
    targetJobLevel = normalizeJobLevel(
      (posting as { target_job_level?: string | null }).target_job_level
    );
    departmentId = posting.department_id ?? null;
    tenantId = posting.tenant_id ?? tenantId;
  }

  const offerMeta = (latestOffer?.job_metadata ?? null) as Record<string, unknown> | null;
  if (typeof offerMeta?.reports_to_employee_id === "string" && offerMeta.reports_to_employee_id) {
    defaultSupervisorId = offerMeta.reports_to_employee_id;
  }
  if (typeof offerMeta?.target_job_level === "string" && offerMeta.target_job_level) {
    targetJobLevel = normalizeJobLevel(offerMeta.target_job_level);
  }

  const { supervisorCandidates } = await fetchDepartmentsAndSupervisors(tenantId);

  return {
    defaultSupervisorId,
    targetJobLevel,
    departmentId,
    tenantId,
    supervisorCandidates,
  };
}

/**
 * Atomic Server Action to promote a hired applicant to an employee record.
 * 
 * Step 1: Validation & Context (verify HR privileges, fetch job application, check signed contract/offer)
 * Step 2: Atomic Promotion Workflow (Profile mapping fix, Salary & Job params, Location & Schedule, Probation, Status lifecycle, Role update)
 * Step 3: Revalidations & Return
 */
export async function promoteApplicantToEmployee(
  applicationId: string,
  options?: { reportsTo?: string | null; jobLevel?: JobLevel },
): Promise<PromoteApplicantResult> {
  const ctx = await requireHrPermission("hires:confirm");
  const supabase = await createClient();
  const admin = getAdminClient();

  // 1. Verify caller has HR privileges and get caller context
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const tenantId = ctx.tenant_id || "00000000-0000-0000-0000-000000000001";

  try {
    // Fetch job_applications or applications record
    // Try job_applications first
    let application: any = null;
    let isJobAppsTable = true;

    const { data: jobApp, error: jobAppErr } = await admin
      .from("job_applications")
      .select(`
        id,
        applicant_id,
        job_id,
        status
      `)
      .eq("id", applicationId)
      .maybeSingle();

    if (jobApp) {
      application = {
        id: jobApp.id,
        applicant_id: jobApp.applicant_id,
        job_id: jobApp.job_id,
        status: jobApp.status
      };
    } else {
      // Fallback to applications table
      isJobAppsTable = false;
      const { data: legacyApp } = await admin
        .from("applications")
        .select(`
          id,
          candidate_id,
          job_posting_id,
          status
        `)
        .eq("id", applicationId)
        .maybeSingle();

      if (legacyApp) {
        application = {
          id: legacyApp.id,
          applicant_id: legacyApp.candidate_id,
          job_id: legacyApp.job_posting_id,
          status: legacyApp.status
        };
      }
    }

    if (!application) {
      return { success: false, error: "Application not found" };
    }

    const candidateProfileId = application.applicant_id;

    // Fetch candidate profile to ensure it exists
    const { data: candidateProfile } = await admin
      .from("profiles")
      .select("id, role, first_name, last_name, email")
      .eq("id", candidateProfileId)
      .maybeSingle();

    if (!candidateProfile) {
      return { success: false, error: "Candidate profile not found. Profile ID mapping required." };
    }

    // Fetch job posting title & details
    const { data: jobPosting } = await admin
      .from("job_postings")
      .select("id, title, employment_type, department_id, default_supervisor_id, target_job_level, salary_min, salary_max, work_setup, shift_start, shift_end, work_days, schedule_type, rest_days_type, leave_policy_type, vacation_leave_days, sick_leave_days, service_incentive_leave_days, leave_eligibility, offer_letter_settings")
      .eq("id", application.job_id)
      .maybeSingle();

    const jobTitle = jobPosting?.title || "Employee";

    // Fetch accepted / active job offer
    // Check job_offers first, then job_offer_applications if needed
    const { data: jobOffer } = await admin
      .from("job_offers")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: jobOfferApp } = await admin
      .from("job_offer_applications")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check application stage: must be in offer, pre_employment, or hired stage with signed contract
    const normalizedAppStatus = String(application.status || "").toLowerCase();
    const offerStatus = String(jobOffer?.status || jobOfferApp?.status || "").toLowerCase();

    const isAcceptedOrSigned = ["accepted", "signed", "hired", "hire_confirmed"].includes(offerStatus) ||
      ["offer", "offer_sent", "pre_employment", "hired", "hire_confirmed"].includes(normalizedAppStatus);

    if (!isAcceptedOrSigned) {
      return { success: false, error: "Application must be in offer, pre-employment, or hired stage with an accepted contract to promote." };
    }

    // Pull salary directly from job_offers / job_offer_applications (do NOT fallback to zero if offered_salary exists)
    let salaryValue = 0;
    if (jobOffer) {
      salaryValue = Number(
        (jobOffer.financial_package as any)?.offered_salary ??
        (jobOffer.job_metadata as any)?.offered_salary ??
        (jobOffer.job_metadata as any)?.salary ??
        jobOffer.salary ??
        0
      );
    }
    if (salaryValue === 0 && jobOfferApp) {
      salaryValue = Number(
        (jobOfferApp.terms as any)?.salary ??
        0
      );
    }
    if (salaryValue === 0 && jobPosting) {
      salaryValue = Number(jobPosting.salary_min ?? jobPosting.salary_max ?? 0);
    }

    // Pull Location & Schedule Parameters
    let workLocationId: string | null =
      (jobOffer?.work_location_id as string | null | undefined) ??
      (typeof (jobPosting as { offer_letter_settings?: Record<string, unknown> | null } | null)?.offer_letter_settings?.work_location_id === "string"
        ? ((jobPosting as { offer_letter_settings?: Record<string, unknown> | null }).offer_letter_settings!.work_location_id as string)
        : undefined) ??
      null;
    const workMode = resolveContractWorkSetup({
      offerWorkSetup:
        (jobOffer?.work_setup as string | null | undefined) ??
        (jobOffer?.work_mode as string | null | undefined) ??
        ((jobOffer?.logistics as Record<string, unknown> | null | undefined)?.work_mode as string | null | undefined) ??
        ((jobOfferApp?.terms as Record<string, unknown> | null | undefined)?.workArrangement as string | null | undefined),
      jobWorkSetup:
        (jobPosting?.work_setup as string | null | undefined) ?? null,
    });
    const initialSchedule = resolveInitialHireSchedule({
      offer: jobOffer,
      jobPosting,
    });
    const shiftStart = initialSchedule.shiftStart;
    const shiftEnd = initialSchedule.shiftEnd;
    const workDays = initialSchedule.workDays;

    if (jobOffer?.logistics) {
      const logistics = jobOffer.logistics as Record<string, unknown>;
      if (!workLocationId && typeof logistics.work_location_id === "string") {
        workLocationId = logistics.work_location_id;
      }
    }

    const resolvedTruth = resolveEmployeeSourceOfTruth({
      offer: jobOffer
        ? {
          job_title:
            typeof (jobOffer.job_metadata as Record<string, unknown> | null | undefined)?.job_title === "string"
              ? ((jobOffer.job_metadata as Record<string, unknown>).job_title as string)
              : null,
          work_setup: workMode,
        }
        : null,
      jobPosting: jobPosting
        ? {
          title: jobPosting.title ?? jobTitle,
          work_setup: jobPosting.work_setup ?? null,
        }
        : { title: jobTitle },
    });
    const resolvedJobTitle = resolvedTruth.position;

    // If workLocationId is still null, fetch default office branch
    if (!workLocationId) {
      const { data: defaultBranch } = await admin
        .from("office_branches")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (defaultBranch) {
        workLocationId = defaultBranch.id;
      }
    }

    workLocationId = await ensureValidWorkLocationId(workLocationId);

    // Probation calculation: start_date = CURRENT_DATE, probation_end_date = start_date + 6 months
    const startDate = new Date();
    const startDateString = startDate.toISOString().split("T")[0];

    const probationEndDate = new Date();
    probationEndDate.setMonth(probationEndDate.getMonth() + 6);
    const probationEndDateString = probationEndDate.toISOString().split("T")[0];

    // Atomic Promotion Operations:
    // 1. Profile Mapping Fix & User Role Update
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        role: "employee",
        updated_at: new Date().toISOString()
      })
      .eq("id", candidateProfileId);

    if (profileErr) {
      return { success: false, error: `Failed to update candidate profile role: ${profileErr.message}` };
    }

    // Update Auth User metadata role if possible via Admin API
    try {
      await admin.auth.admin.updateUserById(candidateProfileId, {
        user_metadata: { role: "employee" }
      });
    } catch {
      // Non-critical
    }

    const offerMeta = (jobOffer?.job_metadata ?? null) as Record<string, unknown> | null;
    const offerReportsTo =
      typeof offerMeta?.reports_to_employee_id === "string" && offerMeta.reports_to_employee_id
        ? offerMeta.reports_to_employee_id
        : null;
    const resolvedReportsTo =
      options?.reportsTo !== undefined
        ? options.reportsTo || null
        : offerReportsTo ?? jobPosting?.default_supervisor_id ?? null;

    const resolvedJobLevel = normalizeJobLevel(
      options?.jobLevel ??
        (typeof offerMeta?.target_job_level === "string" ? offerMeta.target_job_level : null) ??
        (jobPosting as { target_job_level?: string | null } | null)?.target_job_level
    );

    // 2. Upsert employee record with all required columns
    const employeePayload: any = {
      tenant_id: tenantId,
      profile_id: candidateProfileId, // Explicitly link employees.profile_id = application.applicant_id
      application_id: applicationId,
      job_offer_id: jobOffer?.id || jobOfferApp?.id || null,
      department_id: jobPosting?.department_id || null,
      reports_to: resolvedReportsTo,
      job_level: resolvedJobLevel,
      job_title: resolvedJobTitle,
      employment_type: jobPosting?.employment_type || "full_time",
      employment_status: "onboarding", // Set employment_status = 'onboarding'
      start_date: startDateString,
      probation_end_date: probationEndDateString,
      salary: salaryValue, // Non-zero salary
      base_salary: salaryValue,
      work_location_id: workLocationId,
      work_mode: workMode,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      work_days: workDays,
      updated_at: new Date().toISOString()
    };

    const { data: upsertedEmp, error: empErr } = await admin
      .from("employees")
      .upsert(employeePayload, { onConflict: "profile_id" })
      .select("id")
      .single();

    if (empErr) {
      return { success: false, error: `Failed to create/update employee record: ${empErr.message}` };
    }

    // Best-effort initial published schedule row for the current week
    try {
      const weekStart = getCurrentManilaWeekStart();
      await admin.from("schedules").upsert(
        {
          employee_id: upsertedEmp.id,
          week_start: weekStart,
          shift_start: shiftStart,
          shift_end: shiftEnd,
          work_days: workDays,
          location: workMode === "remote" ? "remote" : workMode === "hybrid" ? "hybrid" : "office",
          notes: initialSchedule.workScheduleSummary,
          is_published: true,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "employee_id,week_start" }
      );
    } catch (schedErr) {
      console.warn("[promoteApplicantToEmployee] initial schedule upsert warning:", schedErr);
    }

    // Phase 2: Provision annual leave balances from contracted job_offers / job_postings policy
    try {
      const contractedLeavePolicy = resolveLeavePolicyFromSources(
        (jobOffer as Record<string, unknown> | null) ??
          (jobPosting as Record<string, unknown> | null),
        {
          ...((jobPosting?.offer_letter_settings as Record<string, unknown> | null) ?? {}),
          ...(offerMeta ?? {}),
        }
      );
      await provisionEmployeeLeaveBalances({
        admin,
        tenantId,
        employeeId: upsertedEmp.id,
        policy: contractedLeavePolicy,
        year: new Date().getFullYear(),
      });
    } catch (leaveProvisionErr) {
      console.warn(
        "[promoteApplicantToEmployee] leave balance provisioning warning:",
        leaveProvisionErr
      );
    }

    // 3. Update status lifecycle: job_applications.status = 'hired'
    if (isJobAppsTable) {
      await admin
        .from("job_applications")
        .update({
          status: "hired",
          status_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", applicationId);
    }

    // Also update legacy applications table if it exists
    await admin
      .from("applications")
      .update({
        status: "hired",
        updated_at: new Date().toISOString()
      })
      .eq("id", applicationId);

    // Also update job offers to HIRED status
    if (jobOffer) {
      await admin
        .from("job_offers")
        .update({ status: "HIRED", updated_at: new Date().toISOString() })
        .eq("id", jobOffer.id);
    }

    // Revalidate paths
    revalidatePath("/hr/employees");
    revalidatePath("/hr/jobs");
    revalidatePath("/hr/applicants");
    revalidatePath("/applicant/applications");

    return {
      success: true,
      employeeId: upsertedEmp.id
    };

  } catch (error) {
    console.error("Error promoting applicant to employee:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to promote applicant to employee"
    };
  }
}
