import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

type JobOfferRow = {
  id: string;
  application_id: string;
  job_posting_id: string;
  status: string;
  updated_at: string;
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

export async function POST(_request: NextRequest, { params }: { params: { applicationId: string } }) {
  try {
    const { applicationId } = params;

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

    if (normalizedApplicationStatus === "hire_confirmed" || normalizedOfferStatus === "hired") {
      return NextResponse.json({ success: true, alreadyConfirmed: true, employeeId: application.candidate_id });
    }

    if (!(["signed", "accepted", "hired"].includes(normalizedOfferStatus) || normalizedApplicationStatus === "hired")) {
      return NextResponse.json({ error: "Offer is not ready for confirmation" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const jobTitle = getJobTitle(application);
    const startDate = typeof offer.job_metadata?.start_date === "string" ? offer.job_metadata.start_date : null;

    const [{ error: offerUpdateError }, { error: applicationUpdateError }, { error: profileUpdateError }, { error: notificationError }] = await Promise.all([
      admin
        .from("job_offers")
        .update({
          status: "HIRED",
          updated_at: now,
        })
        .eq("id", offer.id),
      admin
        .from("applications")
        .update({
          status: "hire_confirmed",
          updated_at: now,
        })
        .eq("id", applicationId),
      admin
        .from("profiles")
        .update({
          role: "employee",
          updated_at: now,
        })
        .eq("id", application.candidate_id),
      admin
        .from("notifications")
        .insert({
          recipient_id: application.candidate_id,
          type: "hire_confirmed",
          title: "Your application has been confirmed!",
          body: startDate
            ? `Congratulations! ${jobTitle} has confirmed your hire. Your start date is ${startDate}.`
            : `Congratulations! ${jobTitle} has confirmed your hire.`,
          action_url: "/dashboard",
        }),
    ]);

    if (offerUpdateError) {
      return NextResponse.json({ error: offerUpdateError.message }, { status: 500 });
    }

    if (applicationUpdateError) {
      return NextResponse.json({ error: applicationUpdateError.message }, { status: 500 });
    }

    if (profileUpdateError) {
      return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
    }

    if (notificationError) {
      return NextResponse.json({ error: notificationError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, employeeId: application.candidate_id });
  } catch (error) {
    console.error("[Confirm Hire] Failed to confirm hire:", error);
    return NextResponse.json({ error: "Failed to confirm hire" }, { status: 500 });
  }
}