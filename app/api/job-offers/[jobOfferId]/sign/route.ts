import { NextRequest, NextResponse } from "next/server";

import {
  markOfferSigned,
  verifyDocusealSubmissionCompleted,
} from "@/lib/offer-lifecycle";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const HR_ROLES = new Set(["hr_manager", "admin", "hr"]);

export async function POST(_req: NextRequest, ctx: unknown) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const rawParams = (ctx as { params?: unknown })?.params;
    const params =
      rawParams && typeof (rawParams as Promise<unknown>).then === "function"
        ? await (rawParams as Promise<Record<string, string | undefined>>)
        : ((rawParams as Record<string, string | undefined> | undefined) ?? {});
    const jobOfferId = params?.jobOfferId;

    if (!jobOfferId) {
      return NextResponse.json({ error: "Missing jobOfferId" }, { status: 400 });
    }

    const { data: offer, error: offerError } = await admin
      .from("job_offers")
      .select("id, application_id, status, docuseal_submission_id")
      .eq("id", jobOfferId)
      .maybeSingle();

    if (offerError) {
      return NextResponse.json({ error: offerError.message }, { status: 500 });
    }

    if (!offer) {
      return NextResponse.json({ error: "Job offer not found" }, { status: 404 });
    }

    const [{ data: profile }, { data: application }] = await Promise.all([
      admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      offer.application_id
        ? admin
            .from("job_applications")
            .select("id, applicant_id")
            .eq("id", offer.application_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const isHr = HR_ROLES.has(String(profile?.role ?? ""));
    const isApplicant = Boolean(application?.applicant_id && application.applicant_id === user.id);

    if (!isHr && !isApplicant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedStatus = String(offer.status ?? "").toUpperCase();
    if (["SIGNED", "HIRED", "HIRE_CONFIRMED"].includes(normalizedStatus)) {
      return NextResponse.json({ success: true, alreadySigned: true });
    }

    let submissionId: string | null = offer.docuseal_submission_id ?? null;
    if (!submissionId && offer.application_id) {
      const { data: signedDoc } = await admin
        .from("signed_documents")
        .select("docuseal_submission_id, metadata")
        .eq("application_id", offer.application_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const metaSubId = (signedDoc?.metadata as Record<string, unknown> | null)?.docuseal_submission_id;
      submissionId =
        signedDoc?.docuseal_submission_id ??
        (metaSubId != null ? String(metaSubId) : null);
    }

    const completed = await verifyDocusealSubmissionCompleted(submissionId);
    if (!completed) {
      return NextResponse.json(
        { error: "Signing not completed yet" },
        { status: 409 },
      );
    }

    const result = await markOfferSigned({
      applicationId: offer.application_id,
      offerId: offer.id,
      source: "sign_route",
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, changed: result.changed });
  } catch (error) {
    console.error("[Job Offer Sign] Failed to update signing status:", error);
    return NextResponse.json({ error: "Failed to update signing status" }, { status: 500 });
  }
}