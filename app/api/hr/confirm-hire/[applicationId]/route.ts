import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

type JobOfferRow = {
  id: string;
  application_id: string;
  job_posting_id: string;
  status: string;
  updated_at: string;
  latest_docuseal_url: string | null;
  job_metadata: Record<string, unknown> | null;
  applications: {
    id: string;
    candidate_id: string;
    status: string;
    submitted_at: string;
    updated_at: string;
    profiles?: {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
    } | null;
    job_postings?: {
      id?: string;
      title?: string | null;
      created_by?: string | null;
      salary_min?: number | null;
      salary_max?: number | null;
    } | null;
  } | null;
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

function getJobTitle(application: JobOfferRow["applications"]) {
  return application?.job_postings?.title?.trim() || "the role";
}

export async function POST(_request: NextRequest, ctx: any) {
  try {
    const rawParams = ctx?.params;
    const params = rawParams && typeof rawParams.then === "function" ? await rawParams : rawParams ?? {};
    const applicationId = params?.applicationId as string | undefined;

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

    const { data: offer, error: offerError } = await admin
      .from("job_offers")
      .select(`
        id,
        application_id,
        job_posting_id,
        status,
        updated_at,
        latest_docuseal_url,
        job_metadata,
        applications!inner (
          id,
          candidate_id,
          status,
          submitted_at,
          updated_at,
          profiles!applications_candidate_id_fkey (
            first_name,
            last_name,
            email
          ),
          job_postings!inner (
            id,
            title,
            created_by
          )
        )
      `)
      .eq("application_id", applicationId)
      .maybeSingle<JobOfferRow>();

    if (offerError) {
      return NextResponse.json({ error: offerError.message }, { status: 500 });
    }

    if (!offer?.applications) {
      return NextResponse.json({ error: "Job offer not found" }, { status: 404 });
    }

    const application = offer.applications;
    const jobPosting = toSingle(application.job_postings);
    const normalizedOfferStatus = normalizeStatus(offer.status);
    const normalizedApplicationStatus = normalizeStatus(application.status);

    if (!jobPosting?.created_by || jobPosting.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (normalizedApplicationStatus === "hired" || normalizedApplicationStatus === "hire_confirmed" || normalizedOfferStatus === "hired") {
      return NextResponse.json({ success: true, alreadyConfirmed: true, employeeId: application.candidate_id });
    }

    if (normalizedApplicationStatus === "pre_employment") {
      const { data: applicantDocuments, error: docsError } = await admin
        .from("applicant_documents")
        .select("hr_verified, job_required_documents!inner(is_required)")
        .eq("application_id", applicationId);

      if (docsError) {
        return NextResponse.json({ error: docsError.message }, { status: 500 });
      }

      const requiredDocuments = (applicantDocuments ?? []).filter((document: any) => document.job_required_documents?.is_required !== false);
      const allRequiredVerified = requiredDocuments.length === 0 || requiredDocuments.every((document: any) => document.hr_verified);

      if (!allRequiredVerified) {
        return NextResponse.json({ error: "All required documents must be verified before confirming hire" }, { status: 409 });
      }
    }

    // Check if offer status allows confirmation
    const isReadyForConfirmation = ["signed", "accepted", "hired"].includes(normalizedOfferStatus) || normalizedApplicationStatus === "hired";
    let isActuallySigned = isReadyForConfirmation;

    // If not ready yet, try a live DocuSeal check for "sent" status
    if (!isReadyForConfirmation && normalizedOfferStatus === "sent") {
      try {
        const slug = offer.latest_docuseal_url?.match(
          /\/(?:embed\/)?s\/([^/?#]+)/i
        )?.[1];
        if (slug) {
          const apiUrl = process.env.DOCUSEAL_API_URL || "https://api.docuseal.com";
          const apiKey = process.env.DOCUSEAL_API_KEY;
          if (apiKey) {
            const dsRes = await fetch(
              `${apiUrl}/submitters?slug=${encodeURIComponent(slug)}`,
              { 
                headers: { "X-Auth-Token": apiKey }, 
                cache: "no-store" as const 
              }
            );
            if (dsRes.ok) {
              const dsData = await dsRes.json();
              const submitter = Array.isArray(dsData?.data)
                ? dsData.data[0]
                : Array.isArray(dsData)
                ? dsData[0]
                : dsData;
              isActuallySigned =
                submitter?.status === "completed" ||
                !!submitter?.completed_at;
            }
          }
        }
      } catch (err) {
        // Silently ignore DocuSeal API errors
        console.warn("[Confirm Hire] DocuSeal live check failed:", err);
      }
    }

    if (!isActuallySigned) {
      return NextResponse.json({ error: "Offer is not ready for confirmation" }, { status: 409 });
    }

    // If we confirmed via DocuSeal live check, backfill the status
    if (isActuallySigned && !isReadyForConfirmation) {
      const now = new Date().toISOString();
      await admin
        .from("job_offers")
        .update({ status: "SIGNED", updated_at: now })
        .eq("id", offer.id);
    }

    const now = new Date().toISOString();
    const jobTitle = getJobTitle(application);
    const startDate = typeof offer.job_metadata?.start_date === "string" ? offer.job_metadata.start_date : null;

    const normalizeEmploymentType = (value: unknown) => {
      const normalized = String(value ?? "").trim().toLowerCase();
      if (normalized === "full-time" || normalized === "full_time") return "full_time";
      if (normalized === "part-time" || normalized === "part_time") return "part_time";
      if (normalized === "internship" || normalized === "intern") return "intern";
      if (normalized === "contract") return "contract";
      return "full_time";
    };

    const normalizePayFrequency = (value: unknown) => {
      const normalized = String(value ?? "").trim().toLowerCase();
      if (["weekly", "bi_weekly", "semi_monthly", "monthly"].includes(normalized)) {
        return normalized;
      }
      return "monthly";
    };

    const baseSalaryValue = Number(
      typeof offer.job_metadata?.salary_amount === "number"
        ? offer.job_metadata.salary_amount
        : typeof offer.job_metadata?.salary === "number"
          ? offer.job_metadata.salary
          : jobPosting?.salary_min ?? jobPosting?.salary_max ?? 0
    ) || 0;

    // Perform critical updates sequentially to avoid partial state.
    // Supabase JS doesn't expose DB transactions here, so apply updates
    // in order and attempt simple compensating rollbacks on failure.

    const results: { step: string; error?: string | null }[] = [];

    // 1) Update job_offers -> HIRED
    const { error: offerUpdateError } = await admin
      .from("job_offers")
      .update({ status: "HIRED", updated_at: now })
      .eq("id", offer.id);
    results.push({ step: "offer_update", error: offerUpdateError?.message ?? null });
    if (offerUpdateError) {
      return NextResponse.json({ error: offerUpdateError.message }, { status: 500 });
    }

    // 2) Update applications -> hired
    const { error: applicationUpdateError } = await admin
      .from("applications")
      .update({ status: "hired", updated_at: now })
      .eq("id", applicationId);
    results.push({ step: "application_update", error: applicationUpdateError?.message ?? null });
    if (applicationUpdateError) {
      // Attempt to rollback offer status to previous value
      try {
        await admin.from("job_offers").update({ status: offer.status, updated_at: offer.updated_at }).eq("id", offer.id);
      } catch (rollbackErr) {
        console.warn("[Confirm Hire] failed to rollback offer status", rollbackErr);
      }
      return NextResponse.json({ error: applicationUpdateError.message }, { status: 500 });
    }

    // 3) Update profile role -> employee
    const { error: profileUpdateError } = await admin
      .from("profiles")
      .update({ role: "employee", updated_at: now })
      .eq("id", application.candidate_id);
    results.push({ step: "profile_update", error: profileUpdateError?.message ?? null });
    if (profileUpdateError) {
      // Attempt rollbacks for previous steps
      try {
        await admin.from("applications").update({ status: application.status, updated_at: application.updated_at }).eq("id", applicationId);
        await admin.from("job_offers").update({ status: offer.status, updated_at: offer.updated_at }).eq("id", offer.id);
      } catch (rollbackErr) {
        console.warn("[Confirm Hire] failed to rollback after profile update failure", rollbackErr);
      }
      return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
    }

    // 4) Upsert employees record
    const { error: employeeInsertError } = await admin
      .from("employees")
      .upsert(
        {
          profile_id: application.candidate_id,
          application_id: applicationId,
          department_id: null,
          reports_to: null,
          job_title: jobTitle,
          employment_type: normalizeEmploymentType(offer.job_metadata?.employment_type),
          employment_status: "active",
          start_date: startDate ?? new Date().toISOString().split("T")[0],
          base_salary: baseSalaryValue,
          pay_frequency: normalizePayFrequency(offer.job_metadata?.pay_frequency),
          currency: typeof offer.job_metadata?.salary_currency === "string" ? offer.job_metadata.salary_currency : "PHP",
        },
        { onConflict: "profile_id" }
      );
    results.push({ step: "employee_upsert", error: employeeInsertError?.message ?? null });
    if (employeeInsertError) {
      // Try rolling back profile and application/offer changes
      try {
        // We didn't previously fetch the candidate's prior role reliably in the
        // initial query; restore to null to avoid applying an incorrect role.
        await admin.from("profiles").update({ role: null, updated_at: application.updated_at }).eq("id", application.candidate_id);
        await admin.from("applications").update({ status: application.status, updated_at: application.updated_at }).eq("id", applicationId);
        await admin.from("job_offers").update({ status: offer.status, updated_at: offer.updated_at }).eq("id", offer.id);
      } catch (rollbackErr) {
        console.warn("[Confirm Hire] failed to rollback after employee upsert failure", rollbackErr);
      }
      return NextResponse.json({ error: employeeInsertError.message }, { status: 500 });
    }

    // 5) Insert notification (non-critical)
    const { error: notificationError } = await admin
      .from("notifications")
      .insert({
        recipient_id: application.candidate_id,
        type: "hire_confirmed",
        title: "Your application has been confirmed!",
        body: startDate
          ? `Congratulations! ${jobTitle} has confirmed your hire. Your start date is ${startDate}.`
          : `Congratulations! ${jobTitle} has confirmed your hire.`,
        action_url: "/dashboard",
      });
    results.push({ step: "notification_insert", error: notificationError?.message ?? null });
    if (notificationError) {
      console.warn("[Confirm Hire] failed to insert notification", notificationError.message);
    }

    return NextResponse.json({ success: true, employeeId: application.candidate_id });
  } catch (error) {
    console.error("[Confirm Hire] Failed to confirm hire:", error);
    return NextResponse.json({ error: "Failed to confirm hire" }, { status: 500 });
  }
}