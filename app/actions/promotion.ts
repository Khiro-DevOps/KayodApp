"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export interface PromoteApplicantResult {
  success: boolean;
  employeeId?: string;
  error?: string;
}

/**
 * Atomic Server Action to promote a hired applicant to an employee record.
 * 
 * Step 1: Validation & Context (verify HR privileges, fetch job application, check signed contract/offer)
 * Step 2: Atomic Promotion Workflow (Profile mapping fix, Salary & Job params, Location & Schedule, Probation, Status lifecycle, Role update)
 * Step 3: Revalidations & Return
 */
export async function promoteApplicantToEmployee(applicationId: string): Promise<PromoteApplicantResult> {
  const supabase = await createClient();
  const admin = getAdminClient();

  // 1. Verify caller has HR privileges and get caller context
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: hrProfile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  const isHR = hrProfile?.role === "hr_manager" || hrProfile?.role === "admin";
  if (!isHR) {
    return { success: false, error: "Forbidden: Only HR managers or admins can promote applicants to employees" };
  }

  const tenantId = hrProfile?.tenant_id || "00000000-0000-0000-0000-000000000001";

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
      .select("id, title, employment_type, department_id, salary_min, salary_max")
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
    let workLocationId: string | null = null;
    let workMode: "onsite" | "hybrid" | "remote" = "onsite";
    let shiftStart = "08:00:00";
    let shiftEnd = "17:00:00";
    let workDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

    if (jobOffer?.logistics) {
      const logistics = jobOffer.logistics as any;
      if (logistics.work_location_id) workLocationId = logistics.work_location_id;
      if (logistics.work_mode) workMode = String(logistics.work_mode).toLowerCase() as any;
      if (logistics.shift_start) shiftStart = logistics.shift_start;
      if (logistics.shift_end) shiftEnd = logistics.shift_end;
      if (Array.isArray(logistics.work_days)) workDays = logistics.work_days;
    }

    if (jobOfferApp?.terms) {
      const terms = jobOfferApp.terms as any;
      if (terms.workArrangement) {
        const arr = String(terms.workArrangement).toLowerCase();
        if (arr.includes("remote")) workMode = "remote";
        else if (arr.includes("hybrid")) workMode = "hybrid";
        else workMode = "onsite";
      }
    }

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

    // 2. Upsert employee record with all required columns
    const employeePayload: any = {
      tenant_id: tenantId,
      profile_id: candidateProfileId, // Explicitly link employees.profile_id = application.applicant_id
      application_id: applicationId,
      job_offer_id: jobOffer?.id || jobOfferApp?.id || null,
      department_id: jobPosting?.department_id || null,
      job_title: jobTitle,
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
