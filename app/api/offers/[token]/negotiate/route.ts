import { NextRequest, NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import type { NegotiationPayload } from "@/lib/types";

function normalizeIntent(intent: string | undefined) {
  return intent === "counter" || intent === "question" ? intent : null;
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const body = (await req.json()) as Partial<NegotiationPayload>;
    const intent = normalizeIntent(body.intent);

    if (!intent) {
      return NextResponse.json({ error: "Invalid negotiation intent" }, { status: 400 });
    }

    const token = params.token;
    const admin = getAdminClient();

    const { data: offer, error: offerError } = await admin
      .from("job_offers")
      .select("id, application_id, hr_id, status")
      .eq("id", token)
      .maybeSingle();

    if (offerError) {
      return NextResponse.json({ error: offerError.message }, { status: 500 });
    }

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    const normalizedStatus = offer.status?.toLowerCase?.() ?? offer.status;

    if (normalizedStatus === "signed") {
      return NextResponse.json({ error: "Offer already signed" }, { status: 409 });
    }

    if (normalizedStatus === "expired") {
      return NextResponse.json({ error: "Offer has expired" }, { status: 410 });
    }

    const { data: application, error: applicationError } = await admin
      .from("applications")
      .select(
        `id, candidate_id, job_postings ( title )`
      )
      .eq("id", offer.application_id)
      .maybeSingle();

    if (applicationError || !application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    let hrRecipientId: string | null = offer.hr_id ?? null;

    if (!hrRecipientId) {
      const { data: jobPosting } = await admin
        .from("applications")
        .select("job_postings ( created_by )")
        .eq("id", offer.application_id)
        .maybeSingle();

      const createdBy = (jobPosting as any)?.job_postings?.created_by ?? null;
      hrRecipientId = createdBy;
    }

    const [candidateResult, existingNegotiationResult] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", application.candidate_id)
        .maybeSingle(),
      admin
        .from("job_offer_negotiations")
        .insert({
          offer_id: offer.id,
          application_id: offer.application_id,
          initiator_id: application.candidate_id,
          initiator_role: "applicant",
          target_field: intent === "counter" ? "salary" : "question",
          requested_value: intent === "counter" ? { counterSalary: body.counterSalary ?? null } : { question: body.note ?? null },
          comments: body.note ?? null,
          status: "pending",
        })
        .select("id")
        .single(),
    ]);

    if (existingNegotiationResult.error) {
      return NextResponse.json({ error: existingNegotiationResult.error.message }, { status: 500 });
    }

    const { error: updateError } = await admin
      .from("job_offers")
      .update({
        status: "NEGOTIATING",
        updated_at: new Date().toISOString(),
      })
      .eq("id", offer.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const candidateName = [candidateResult.data?.first_name, candidateResult.data?.last_name].filter(Boolean).join(" ") || "The candidate";
    const jobTitle = (application as { job_postings?: { title?: string | null } | null }).job_postings?.title ?? "the offer";

    if (hrRecipientId) {
      await sendNotification({
        supabase: admin,
        recipientId: hrRecipientId,
        type: "offer_negotiation_submitted",
        title: intent === "counter" ? "Negotiation request received" : "Question received",
        body:
          intent === "counter"
            ? `${candidateName} requested different terms for ${jobTitle}.`
            : `${candidateName} asked a question about ${jobTitle}.`,
        actionUrl: `/job-offer/${offer.id}`,
        senderId: application.candidate_id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Offer Negotiation] Failed to process request:", error);
    return NextResponse.json({ error: "Failed to submit negotiation" }, { status: 500 });
  }
}
