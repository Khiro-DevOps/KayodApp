import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getDocusealBaseUrl } from "@/lib/docuseal";
import { cascadeCloseSecondaryApplicationsOnHire } from "@/lib/hire-cascade";
import { sendNotification } from "@/lib/notifications";
import { resolveOfferCompensation } from "@/lib/offer-salary";
import {
  markOfferSigned,
  verifyDocusealSubmissionCompleted,
} from "@/lib/offer-lifecycle";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canHr } from "@/lib/rbac/permissions";
import { getHrSessionContext } from "@/lib/rbac/server";
import { normalizeJobLevel } from "@/lib/workforce-hierarchy";
import {
  getCurrentManilaWeekStart,
  resolveInitialHireSchedule,
} from "@/lib/schedule-policy";
import {
  provisionEmployeeLeaveBalances,
  resolveLeavePolicyFromSources,
} from "@/lib/leave-policy";

const HR_ROLES = new Set(["hr_manager", "admin", "hr"]);

type JobPostingRelation = {
  id?: string;
  title?: string | null;
  created_by?: string | null;
  tenant_id?: string | null;
  department_id?: string | null;
  default_supervisor_id?: string | null;
  target_job_level?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  work_setup?: string | null;
  work_location_id?: string | null;
};

type JobApplicationRelation = {
  id: string;
  applicant_id: string;
  job_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  job_postings?: JobPostingRelation | JobPostingRelation[] | null;
};

type JobOfferRow = {
  id: string;
  application_id: string;
  job_id: string | null;
  status: string;
  salary?: number | null;
  offered_salary?: number | null;
  start_date?: string | null;
  work_mode?: string | null;
  work_setup?: string | null;
  work_location_id?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  work_days?: string[] | null;
  docuseal_submission_id?: string | null;
  updated_at: string;
  latest_docuseal_url: string | null;
  financial_package?: Record<string, unknown> | null;
  job_metadata: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  job_applications: JobApplicationRelation | JobApplicationRelation[] | null;
};

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeWorkMode(value: unknown): "onsite" | "hybrid" | "remote" {
  const norm = String(value ?? "").trim().toLowerCase();
  if (norm === "hybrid") return "hybrid";
  if (norm === "remote" || norm === "wfh") return "remote";
  return "onsite";
}

function normalizeEmploymentType(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "full-time" || normalized === "full_time") return "full_time";
  if (normalized === "part-time" || normalized === "part_time") return "part_time";
  if (normalized === "internship" || normalized === "intern") return "intern";
  if (normalized === "contract") return "contract";
  return "full_time";
}

function normalizePayFrequency(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["weekly", "bi_weekly", "semi_monthly", "monthly"].includes(normalized)) {
    return normalized;
  }
  return "monthly";
}

async function checkDocusealSlugCompleted(latestUrl: string | null): Promise<boolean> {
  try {
    const slug = latestUrl?.match(/\/(?:embed\/)?s\/([^/?#]+)/i)?.[1];
    const apiKey = process.env.DOCUSEAL_API_KEY?.trim();
    if (!slug || !apiKey) return false;

    const dsRes = await fetch(
      `${getDocusealBaseUrl()}/submitters?slug=${encodeURIComponent(slug)}`,
      {
        headers: { "X-Auth-Token": apiKey },
        cache: "no-store",
      },
    );
    if (!dsRes.ok) return false;

    const dsData = await dsRes.json();
    const submitter = Array.isArray(dsData?.data)
      ? dsData.data[0]
      : Array.isArray(dsData)
        ? dsData[0]
        : dsData;

    return submitter?.status === "completed" || Boolean(submitter?.completed_at);
  } catch {
    return false;
  }
}

export async function POST(_request: NextRequest, ctx: unknown) {
  try {
    const rawParams = (ctx as { params?: unknown })?.params;
    const params =
      rawParams && typeof (rawParams as Promise<unknown>).then === "function"
        ? await (rawParams as Promise<Record<string, string | undefined>>)
        : ((rawParams as Record<string, string | undefined> | undefined) ?? {});
    const applicationId = params?.applicationId;

    if (!applicationId) {
      return NextResponse.json({ error: "Missing application id" }, { status: 400 });
    }

    const supabase = await createClient();
    const admin = getAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ data: actorProfile }, { data: offer, error: offerError }] = await Promise.all([
      admin.from("profiles").select("role, tenant_id").eq("id", user.id).maybeSingle(),
      admin
        .from("job_offers")
        .select(`
          id,
          application_id,
          job_id,
          status,
          salary,
          start_date,
          work_mode,
          work_setup,
          work_location_id,
          shift_start,
          shift_end,
          work_days,
          leave_policy_type,
          vacation_leave_days,
          sick_leave_days,
          service_incentive_leave_days,
          leave_eligibility,
          docuseal_submission_id,
          updated_at,
          latest_docuseal_url,
          financial_package,
          job_metadata,
          metadata,
          job_applications!inner (
            id,
            applicant_id,
            job_id,
            status,
            created_at,
            updated_at,
            profiles!job_applications_applicant_id_fkey (
              first_name,
              last_name,
              email
            ),
            job_postings!job_applications_job_id_fkey (
              id,
              title,
              created_by,
              tenant_id,
              department_id,
              default_supervisor_id,
              target_job_level,
              salary_min,
              salary_max,
              work_setup,
              shift_start,
              shift_end,
              work_days,
              schedule_type,
              rest_days_type,
              leave_policy_type,
              vacation_leave_days,
              sick_leave_days,
              service_incentive_leave_days,
              leave_eligibility,
              offer_letter_settings
            )
          )
        `)
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<JobOfferRow>(),
    ]);

    if (offerError) {
      return NextResponse.json({ error: offerError.message }, { status: 500 });
    }

    const application = toSingle(offer?.job_applications);
    if (!offer || !application) {
      return NextResponse.json({ error: "Job offer not found" }, { status: 404 });
    }

    const jobPosting = toSingle(application.job_postings);
    const normalizedOfferStatus = normalizeStatus(offer.status);
    const normalizedApplicationStatus = normalizeStatus(application.status);

    const hrSession = await getHrSessionContext();
    const isHrRole = HR_ROLES.has(String(actorProfile?.role ?? ""));
    const canConfirmHire = hrSession
      ? canHr(hrSession.hr_role, "hires:confirm", hrSession.is_tenant_owner)
      : false;
    const sameTenant =
      !actorProfile?.tenant_id ||
      !jobPosting?.tenant_id ||
      actorProfile.tenant_id === jobPosting.tenant_id;

    if (!isHrRole || !canConfirmHire || !sameTenant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      normalizedApplicationStatus === "hired" ||
      normalizedApplicationStatus === "hire_confirmed" ||
      normalizedOfferStatus === "hired"
    ) {
      return NextResponse.json({
        success: true,
        alreadyConfirmed: true,
        status: "hired",
        employeeId: application.applicant_id,
        warnings: [],
      });
    }

    // Non-blocking applicant_documents check: collect warnings instead of blocking
    const warnings: string[] = [];
    if (normalizedApplicationStatus === "pre_employment") {
      const { data: applicantDocuments, error: docsError } = await admin
        .from("applicant_documents")
        .select("hr_verified, job_required_documents!inner(is_required)")
        .eq("application_id", applicationId);

      if (docsError) {
        warnings.push(`Could not verify pre-employment documents: ${docsError.message}`);
      } else {
        const requiredDocuments = (applicantDocuments ?? []).filter(
          (doc: { hr_verified?: boolean; job_required_documents?: { is_required?: boolean | null } | Array<{ is_required?: boolean | null }> | null }) => {
            const reqDoc = toSingle(doc.job_required_documents);
            return reqDoc?.is_required !== false;
          },
        );
        const allRequiredVerified =
          requiredDocuments.length === 0 ||
          requiredDocuments.every((doc: { hr_verified?: boolean }) => Boolean(doc.hr_verified));

        if (!allRequiredVerified) {
          warnings.push("Some required pre-employment documents are not yet verified.");
        }
      }
    }

    const isReadyInDb =
      normalizedApplicationStatus === "pre_employment" ||
      normalizedOfferStatus === "signed";

    if (!isReadyInDb) {
      const completedViaSubmission = offer.docuseal_submission_id
        ? await verifyDocusealSubmissionCompleted(offer.docuseal_submission_id)
        : false;
      const completedViaSlug =
        !completedViaSubmission && offer.latest_docuseal_url
          ? await checkDocusealSlugCompleted(offer.latest_docuseal_url)
          : false;

      if (!completedViaSubmission && !completedViaSlug) {
        return NextResponse.json(
          { error: "Offer not signed yet" },
          { status: 409 },
        );
      }

      const lifecycleResult = await markOfferSigned({
        applicationId,
        offerId: offer.id,
        source: "confirm_hire_reconcile",
      });

      if (lifecycleResult.error) {
        return NextResponse.json({ error: lifecycleResult.error }, { status: 500 });
      }
    }

    const now = new Date().toISOString();
    const jobTitle = jobPosting?.title?.trim() || "the role";
    const metadata = offer.metadata ?? {};
    const jobMetadata = offer.job_metadata ?? {};

    const startDate =
      offer.start_date ??
      (typeof jobMetadata.start_date === "string" ? jobMetadata.start_date : null) ??
      now.split("T")[0];

    const {
      baseSalary: baseSalaryValue,
      monthlyAllowance,
      attendanceIncentive,
    } = resolveOfferCompensation(
      {
        ...offer,
        metadata,
        job_metadata: jobMetadata,
      },
      jobPosting,
      35000,
    );

    // 1) Update job_offers -> HIRED
    const { error: offerUpdateError } = await admin
      .from("job_offers")
      .update({ status: "HIRED", updated_at: now })
      .eq("id", offer.id);

    if (offerUpdateError) {
      return NextResponse.json({ error: offerUpdateError.message }, { status: 500 });
    }

    // 2) Update job_applications -> hired
    const { error: applicationUpdateError } = await admin
      .from("job_applications")
      .update({ status: "hired", updated_at: now })
      .eq("id", applicationId);

    if (applicationUpdateError) {
      try {
        await admin
          .from("job_offers")
          .update({ status: offer.status, updated_at: offer.updated_at })
          .eq("id", offer.id);
      } catch (rollbackErr) {
        console.warn("[Confirm Hire] failed to rollback offer status", rollbackErr);
      }
      return NextResponse.json({ error: applicationUpdateError.message }, { status: 500 });
    }

    const extractedWorkMode = normalizeWorkMode(
      offer.work_mode ??
        offer.work_setup ??
        jobPosting?.work_setup ??
        metadata.work_model ??
        jobMetadata.work_model ??
        jobMetadata.work_arrangement,
    );

    const initialSchedule = resolveInitialHireSchedule({
      offer,
      jobPosting: jobPosting as Parameters<typeof resolveInitialHireSchedule>[0]["jobPosting"],
    });
    const extractedWorkDays = initialSchedule.workDays;
    const extractedShiftStart = initialSchedule.shiftStart;
    const extractedShiftEnd = initialSchedule.shiftEnd;

    const tenantId =
      jobPosting?.tenant_id ??
      actorProfile?.tenant_id ??
      null;

    if (!tenantId) {
      return NextResponse.json(
        { error: "Cannot confirm hire: tenant_id is missing on job posting and HR profile." },
        { status: 400 }
      );
    }

    const jobOfferSettings = (jobPosting as { offer_letter_settings?: Record<string, unknown> | null } | null)?.offer_letter_settings ?? null;
    const jobWorkLocationId = typeof jobOfferSettings?.work_location_id === "string" ? jobOfferSettings.work_location_id : null;
    let resolvedWorkLocationId: string | null =
      offer.work_location_id ?? jobWorkLocationId ?? null;

    if (!resolvedWorkLocationId && tenantId) {
      const { data: defaultWorkLoc } = await admin
        .from("work_locations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();

      if (defaultWorkLoc?.id) {
        resolvedWorkLocationId = defaultWorkLoc.id;
      } else {
        const { data: defaultBranch } = await admin
          .from("office_branches")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        resolvedWorkLocationId = defaultBranch?.id ?? null;
      }
    }

    // 4) Upsert employees record (including NOT NULL columns from 20260930 migration)
    const employeePayload = {
      profile_id: application.applicant_id,
      tenant_id: tenantId,
      application_id: applicationId as string | null,
      job_offer_id: offer.id,
      department_id: jobPosting?.department_id ?? null,
      reports_to:
        (typeof jobMetadata.reports_to_employee_id === "string" && jobMetadata.reports_to_employee_id
          ? jobMetadata.reports_to_employee_id
          : null) ??
        jobPosting?.default_supervisor_id ??
        null,
      job_level: normalizeJobLevel(
        (typeof jobMetadata.target_job_level === "string" ? jobMetadata.target_job_level : null) ??
          jobPosting?.target_job_level
      ),
      job_title: jobTitle,
      employment_type: normalizeEmploymentType(jobMetadata.employment_type),
      employment_status: "active",
      start_date: startDate,
      salary: baseSalaryValue,
      base_salary: baseSalaryValue,
      monthly_allowance: monthlyAllowance,
      attendance_incentive: attendanceIncentive,
      pay_frequency: normalizePayFrequency(jobMetadata.pay_frequency),
      currency:
        typeof jobMetadata.salary_currency === "string"
          ? jobMetadata.salary_currency
          : "PHP",
      work_mode: extractedWorkMode,
      work_location_id: resolvedWorkLocationId,
      work_days: extractedWorkDays,
      shift_start: extractedShiftStart,
      shift_end: extractedShiftEnd,
      updated_at: now,
    };

    let { error: employeeInsertError } = await admin
      .from("employees")
      .upsert(employeePayload, { onConflict: "profile_id" });

    if (
      employeeInsertError &&
      (employeeInsertError.message?.toLowerCase().includes("monthly_allowance") ||
        employeeInsertError.message?.toLowerCase().includes("attendance_incentive") ||
        employeeInsertError.message?.toLowerCase().includes("schema cache"))
    ) {
      const { monthly_allowance: _ma, attendance_incentive: _ai, ...fallbackPayload } = employeePayload;
      const retryComp = await admin
        .from("employees")
        .upsert(fallbackPayload, { onConflict: "profile_id" });
      employeeInsertError = retryComp.error;
    }

    if (
      employeeInsertError &&
      employeeInsertError.message?.includes("employees_application_id_fkey")
    ) {
      const { monthly_allowance: _ma, attendance_incentive: _ai, ...fallbackPayload } = employeePayload;
      const retryRes = await admin
        .from("employees")
        .upsert(
          { ...fallbackPayload, application_id: null },
          { onConflict: "profile_id" },
        );
      employeeInsertError = retryRes.error;
    }

    if (employeeInsertError) {
      try {
        await admin
          .from("job_applications")
          .update({ status: application.status, updated_at: application.updated_at })
          .eq("id", applicationId);
        await admin
          .from("job_offers")
          .update({ status: offer.status, updated_at: offer.updated_at })
          .eq("id", offer.id);
      } catch (rollbackErr) {
        console.warn("[Confirm Hire] failed to rollback after employee upsert failure", rollbackErr);
      }
      return NextResponse.json({ error: employeeInsertError.message }, { status: 500 });
    }

    // Seed initial published schedule row for the current week (best-effort)
    try {
      const { data: empRow } = await admin
        .from("employees")
        .select("id")
        .eq("profile_id", application.applicant_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (empRow?.id) {
        const weekStart = getCurrentManilaWeekStart();
        await admin.from("schedules").upsert(
          {
            employee_id: empRow.id,
            week_start: weekStart,
            shift_start: extractedShiftStart,
            shift_end: extractedShiftEnd,
            work_days: extractedWorkDays,
            location:
              extractedWorkMode === "remote"
                ? "remote"
                : extractedWorkMode === "hybrid"
                  ? "hybrid"
                  : "office",
            notes: initialSchedule.workScheduleSummary,
            is_published: true,
            created_by: user.id,
            updated_at: now,
          },
          { onConflict: "employee_id,week_start" }
        );

        // Phase 2: Provision annual leave balances from contracted job_offers terms
        const contractedLeavePolicy = resolveLeavePolicyFromSources(
          offer as unknown as Record<string, unknown>,
          {
            ...(jobOfferSettings ?? {}),
            ...(jobPosting as unknown as Record<string, unknown> | null),
            ...jobMetadata,
          }
        );
        await provisionEmployeeLeaveBalances({
          admin,
          tenantId,
          employeeId: empRow.id,
          policy: contractedLeavePolicy,
          year: new Date().getFullYear(),
        });
      }
    } catch (schedErr) {
      console.warn("[Confirm Hire] initial schedule upsert warning:", schedErr);
    }

    // 5) Cascade-close secondary open applications, pending interviews, and open offers
    await cascadeCloseSecondaryApplicationsOnHire({
      admin,
      applicantId: application.applicant_id,
      winningApplicationId: applicationId,
      jobTitle,
    });

    // 6) Send hire_confirmed notification via admin helper
    await sendNotification({
      recipientId: application.applicant_id,
      type: "hire_confirmed",
      title: "Hiring Confirmed — Welcome Aboard!",
      body: `HR has confirmed your hire for ${jobTitle}. Click here to open your Employee Dashboard and complete your pre-employment requirements.`,
      actionUrl: `/api/applicant/activate-employee?applicationId=${encodeURIComponent(applicationId)}`,
      actionName: "confirmHire",
    });

    revalidatePath("/hr", "layout");

    return NextResponse.json({
      success: true,
      status: "hired",
      employeeId: application.applicant_id,
      warnings,
    });
  } catch (error) {
    console.error("[Confirm Hire] Failed to confirm hire:", error);
    return NextResponse.json({ error: "Failed to confirm hire" }, { status: 500 });
  }
}
