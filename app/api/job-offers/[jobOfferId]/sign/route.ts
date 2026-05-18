import { NextRequest, NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(_req: NextRequest, { params }: { params: { jobOfferId: string } }) {
  try {
    const admin = getAdminClient();
    const { jobOfferId } = params;

    const { data: offer, error: offerError } = await admin
      .from("job_offers")
      .select("id, application_id, status")
      .eq("id", jobOfferId)
      .maybeSingle();

    if (offerError) {
      return NextResponse.json({ error: offerError.message }, { status: 500 });
    }

    if (!offer) {
      return NextResponse.json({ error: "Job offer not found" }, { status: 404 });
    }

    const normalizedStatus = offer.status?.toLowerCase?.() ?? String(offer.status ?? "").toLowerCase();
    if (["signed", "accepted", "hired"].includes(normalizedStatus)) {
      return NextResponse.json({ success: true, alreadySigned: true });
    }

    const { error: updateError } = await admin
      .from("job_offers")
      .update({
        status: "SIGNED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobOfferId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const signedAt = new Date().toISOString();

    const signedDocumentUpdates = {
      status: "signed",
      signed_at: signedAt,
      updated_at: signedAt,
    };

    const [{ error: signedDocumentByIdError }, { error: signedDocumentByApplicationError }] = await Promise.all([
      admin
        .from("signed_documents")
        .update(signedDocumentUpdates)
        .eq("id", jobOfferId),
      offer.application_id
        ? admin
            .from("signed_documents")
            .update(signedDocumentUpdates)
            .eq("application_id", offer.application_id)
        : Promise.resolve({ error: null as null }),
    ]);

    if (signedDocumentByIdError || signedDocumentByApplicationError) {
      console.error("[Job Offer Sign] Failed to update signed_documents:", {
        signedDocumentByIdError: signedDocumentByIdError?.message ?? null,
        signedDocumentByApplicationError: signedDocumentByApplicationError?.message ?? null,
      });
    }

    if (offer.application_id) {
      const { error: applicationError } = await admin
        .from("applications")
        .update({ status: "hired", contract_offer_id: jobOfferId })
        .eq("id", offer.application_id);

      if (applicationError) {
        return NextResponse.json({ error: applicationError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Job Offer Sign] Failed to update signing status:", error);
    return NextResponse.json({ error: "Failed to update signing status" }, { status: 500 });
  }
}