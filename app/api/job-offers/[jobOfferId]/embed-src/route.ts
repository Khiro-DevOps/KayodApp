import { NextRequest, NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";
import { createDocusealSubmission } from "@/lib/docuseal";
import { getOrCreateDocusealEmbedSrc } from "@/lib/docuseal-actions";

export async function GET(_req: NextRequest, ctx: any) {
  try {
    const rawParams = ctx?.params;
    const params = rawParams && typeof rawParams.then === "function" ? await rawParams : rawParams ?? {};
    const jobOfferId = params?.jobOfferId as string | undefined;

    if (!jobOfferId) {
      return NextResponse.json({ error: "Job offer ID is required" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: jobOffer, error: jobOfferError } = await admin
      .from("job_offers")
      .select("id, application_id, latest_docuseal_url, job_id, contract_template_id")
      .eq("id", jobOfferId)
      .single();

    if (jobOfferError) {
      return NextResponse.json({ error: jobOfferError.message }, { status: 500 });
    }

    if (!jobOffer) {
      return NextResponse.json({ error: "Job offer not found" }, { status: 404 });
    }

    if (jobOffer.latest_docuseal_url) {
      const embedSrc = await getOrCreateDocusealEmbedSrc(jobOfferId);
      return NextResponse.json({ embedSrc });
    }

    if (!jobOffer.application_id) {
      return NextResponse.json({ error: "Job offer is not attached to an application" }, { status: 400 });
    }

    const { data: application, error: applicationError } = await admin
      .from("applications")
      .select(`
        id,
        candidate_id,
        job_posting_id,
        profiles!applications_candidate_id_fkey (
          first_name,
          last_name,
          email
        )
      `)
      .eq("id", jobOffer.application_id)
      .single();

    if (applicationError) {
      return NextResponse.json({ error: applicationError.message }, { status: 500 });
    }

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    let templateId = "";
    const jobPostingId = String(application.job_posting_id ?? "").trim();
    if (jobPostingId) {
      const { data: jobPosting, error: jobPostingError } = await admin
        .from("job_postings")
        .select("docuseal_template_id")
        .eq("id", jobPostingId)
        .maybeSingle();

      if (jobPostingError) {
        return NextResponse.json({ error: jobPostingError.message }, { status: 500 });
      }

      templateId = String(jobPosting?.docuseal_template_id ?? "").trim();
    }

    if (!templateId && jobOffer.contract_template_id) {
      const { data: contractTemplate, error: contractTemplateError } = await admin
        .from("contract_templates")
        .select("docuseal_template_id")
        .eq("id", jobOffer.contract_template_id)
        .maybeSingle();

      if (contractTemplateError) {
        return NextResponse.json({ error: contractTemplateError.message }, { status: 500 });
      }

      templateId = String(contractTemplate?.docuseal_template_id ?? "").trim();
    }

    if (!templateId) {
      return NextResponse.json({
        error: "DocuSeal template ID not found for this offer. Checked both the associated job posting and the offer contract template.",
      }, { status: 400 });
    }

    const profile = application.profiles?.[0];
    const candidateName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "Candidate";
    const candidateEmail = profile?.email?.trim();

    if (!candidateEmail) {
      return NextResponse.json({ error: "Candidate email is required to create a signing session" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "http://localhost:3000";
    const submission = await createDocusealSubmission({
      templateId,
      submitterName: candidateName,
      submitterEmail: candidateEmail,
      externalId: jobOfferId,
      sendEmail: false,
      redirectUrl: `${appUrl}/job-offer/${jobOfferId}`,
    });

    const { error: updateError } = await admin
      .from("job_offers")
      .update({ latest_docuseal_url: submission.signingUrl, updated_at: new Date().toISOString() })
      .eq("id", jobOfferId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ embedSrc: submission.embedSrc });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve embed source";
    console.error("[API] Failed to get DocuSeal embed source:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
