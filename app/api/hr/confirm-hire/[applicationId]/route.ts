import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getDocusealBaseUrl } from "@/lib/docuseal";
import { sendNotification } from "@/lib/notifications";
import {
  markOfferSigned,
  verifyDocusealSubmissionCompleted,
} from "@/lib/offer-lifecycle";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const HR_ROLES = new Set(["hr_manager", "admin", "hr"]);

type JobPostingRelation = {
  id?: string;
  title?: string | null;
  created_by?: string | null;
  tenant_id?: string | null;
  department_id?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
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
          docuseal_submission_id,
          updated_at,
          latest_docuseal_url,
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
              salary_min,
              salary_max
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

    const isHrRole = HR_ROLES.has(String(actorProfile?.role ?? ""));
    const isCreator = Boolean(jobPosting?.created_by && jobPosting.created_by === user.id);
    const sameTenant =
      !actorProfile?.tenant_id ||
      !jobPosting?.tenant_id ||
      actorProfile.tenant_id === jobPosting.tenant_id;

    if ((!isHrRole && !isCreator) || !sameTenant) {
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

    const offerSalary =
      typeof offer.salary === "number" && offer.salary > 0 ? offer.salary : null;
    const metadataSalary =
      typeof jobMetadata.base_salary === "number" && jobMetadata.base_salary > 0
        ? jobMetadata.base_salary
        : typeof jobMetadata.salary_amount === "number" && jobMetadata.salary_amount > 0
          ? jobMetadata.salary_amount
          : typeof jobMetadata.salary === "number" && jobMetadata.salary > 0
            ? jobMetadata.salary
            : null;

    const baseSalaryValue =
      Number(
        offerSalary ??
          metadataSalary ??
          jobPosting?.salary_min ??
          jobPosting?.salary_max ??
          0,
      ) || 0;

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
        metadata.work_model ??
        jobMetadata.work_model ??
        jobMetadata.work_arrangement,
    );

    const defaultWorkDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const extractedWorkDays =
      Array.isArray(offer.work_days) && offer.work_days.length > 0
        ? offer.work_days
        : defaultWorkDays;

    const extractedShiftStart =
      offer.shift_start ??
      (typeof metadata.shift_start === "string" ? metadata.shift_start : null) ??
      (typeof jobMetadata.shift_start === "string" ? jobMetadata.shift_start : null) ??
      "09:00";

    const extractedShiftEnd =
      offer.shift_end ??
      (typeof metadata.shift_end === "string" ? metadata.shift_end : null) ??
      (typeof jobMetadata.shift_end === "string" ? jobMetadata.shift_end : null) ??
      "18:00";

    const tenantId =
      jobPosting?.tenant_id ??
      actorProfile?.tenant_id ??
      "00000000-0000-0000-0000-000000000001";

    // 4) Upsert employees record (including NOT NULL columns from 20260930 migration)
    const employeePayload = {
      profile_id: application.applicant_id,
      tenant_id: tenantId,
      application_id: applicationId as string | null,
      job_offer_id: offer.id,
      department_id: jobPosting?.department_id ?? null,
      reports_to: null,
      job_title: jobTitle,
      employment_type: normalizeEmploymentType(jobMetadata.employment_type),
      employment_status: "active",
      start_date: startDate,
      salary: baseSalaryValue,
      base_salary: baseSalaryValue,
      pay_frequency: normalizePayFrequency(jobMetadata.pay_frequency),
      currency:
        typeof jobMetadata.salary_currency === "string"
          ? jobMetadata.salary_currency
          : "PHP",
      work_mode: extractedWorkMode,
      work_location_id: offer.work_location_id ?? null,
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
      employeeInsertError.message?.includes("employees_application_id_fkey")
    ) {
      const retryRes = await admin
        .from("employees")
        .upsert(
          { ...employeePayload, application_id: null },
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

    // 5) Send hire_confirmed notification via admin helper
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
