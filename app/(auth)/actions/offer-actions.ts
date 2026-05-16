"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendOfferWithDocuSeal } from "@/app/(dashboard)/jobs/manage/[id]/applicants/[appId]/offer/send-with-docuseal-actions";

export async function sendHydratedOffer(jobId: string, applicationId: string) {
  const supabase = await createClient();
  const admin = getAdminClient();

  console.log("[sendHydratedOffer] Starting offer creation flow", {
    jobId,
    applicationId,
    timestamp: new Date().toISOString(),
  });

  // 1. Fetch Job Listing configuration (Template Data)
  const { data: job, error: jobError } = await supabase
    .from("job_postings")
    .select("title, work_setup, salary_min, offer_letter_settings, docuseal_template_id, created_by")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error("Job fetch error:", jobError);
    throw new Error("Failed to fetch job blueprint");
  }

  const { data: creatorProfile, error: creatorProfileError } = await supabase
    .from("profiles")
    .select("tenants(id, name)")
    .eq("id", job.created_by)
    .single();

  if (creatorProfileError) {
    console.warn("[sendHydratedOffer] Failed to resolve company name:", creatorProfileError);
  }

  const companyName = (creatorProfile?.tenants as { name?: string | null } | null)?.name ?? null;

  // Retire any existing active offers so a replacement can be created safely.
  const { error: archiveError } = await admin
    .from("job_offers")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("application_id", applicationId)
    .eq("is_active", true);

  if (archiveError) {
    throw new Error(`Failed to archive existing active offers: ${archiveError.message}`);
  }

  // Get current user id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Must be logged in to create an offer");
  }

  // 2. Hydrate the initial Offer Record and set state to DRAFT
  const { data: offer, error: offerError } = await admin
    .from("job_offers")
    .insert({
      application_id: applicationId,
      job_id: jobId,
      status: "DRAFT", 
      version_id: 1,
      is_active: true,
      created_by: user.id,
      
      salary: job.offer_letter_settings?.phMonthlyBasicSalary || job.salary_min || 0,
      start_date: job.offer_letter_settings?.phStartDate || null,
      work_setup: job.work_setup || 'Remote',
      department: job.offer_letter_settings?.phDepartment || null,
      probation_days: job.offer_letter_settings?.phProbationPeriodDays || 180,
      job_metadata: {
        company_name: companyName,
        start_date: job.offer_letter_settings?.phStartDate || null,
        job_title: job.title,
      },
    })
    .select()
    .single();

  if (offerError) {
    console.error("Offer creation error:", offerError);
    throw new Error(`Failed to generate offer: ${offerError.message}`);
  }

  // 3. Dispatch the external DocuSeal contract automatically using modern flow
  const sendResult = await sendOfferWithDocuSeal(jobId, applicationId, offer.id);
  if (!sendResult.success) {
    console.error(`DocuSeal integration failed: ${sendResult.error}`);
    // Rollback the offer creation so the user can retry without state corruption
    await admin.from("job_offers").delete().eq("id", offer.id);
    throw new Error(`Failed to send contract via DocuSeal: ${sendResult.error}`);
  }

  // At this point the external DocuSeal submission was created; finalize by creating
  // a signed_documents row and only then update job_offers + applications. If any
  // of these steps fail, rollback the created job_offers to avoid a partial state
  // where application.status === 'offer_sent' but no offer exists.

  // Create or find a contract_templates record so signed_documents can reference it
  let contractTemplateId: string | null = null;
  try {
    const templateKey = String(job.docuseal_template_id || "").trim();
    if (templateKey) {
      const { data: existingTemplate } = await admin
        .from("contract_templates")
        .select("id")
        .eq("docuseal_template_id", templateKey)
        .maybeSingle();

      if (existingTemplate) {
        contractTemplateId = existingTemplate.id;
      } else {
        const { data: newTemplate } = await admin
          .from("contract_templates")
          .insert({
            job_posting_id: jobId,
            template_name: `Template ${templateKey}`,
            docuseal_template_id: templateKey,
            external_id: templateKey,
            created_by: (job as any)?.created_by || user.id,
          })
          .select("id")
          .single();
        contractTemplateId = newTemplate?.id ?? null;
      }
    }
  } catch (err) {
    console.warn("Failed to resolve/create contract_templates record:", err);
  }

  // Create a signed_documents placeholder using the same minimal shape as the working legacy flow.
  const { data: signedDoc, error: signedDocError } = await admin
    .from("signed_documents")
    .insert({
      application_id: applicationId,
      contract_template_id: contractTemplateId,
      signing_method: "digital",
      status: "sent",
    })
    .select("id")
    .single();
  if (signedDocError || !signedDoc?.id) {
    // Rollback created job offer to avoid partial state
    await admin.from("job_offers").delete().eq("id", offer.id);
    throw new Error(`Failed to create signed_documents placeholder: ${signedDocError?.message ?? "unknown error"}`);
  }

  const docusealUrl = sendResult.url ?? null;

  // Update signed_documents, mark job_offer as SENT, then update applications.
  try {
    await admin
      .from("signed_documents")
      .update({
        docuseal_submission_url: docusealUrl,
        metadata: {
          job_offer_id: offer.id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", signedDoc.id);

    await admin
      .from("job_offers")
      .update({ status: "SENT", updated_at: new Date().toISOString() })
      .eq("id", offer.id);

    await admin
      .from("applications")
      .update({ status: "offer_sent", contract_offer_id: signedDoc.id, updated_at: new Date().toISOString() })
      .eq("id", applicationId);
  } catch (err) {
    console.error("sendHydratedOffer: failed to finalize offer, rolling back", err);
    // Rollback both signed_documents and job_offers to avoid partial state
    await admin.from("signed_documents").delete().eq("id", signedDoc.id);
    await admin.from("job_offers").delete().eq("id", offer.id);
    throw new Error("Failed to finalize offer creation; no changes were applied. Please try again.");
  }

  console.log("[sendHydratedOffer] Offer created and sent successfully", {
    jobId,
    applicationId,
    offerId: offer.id,
    status: "DRAFT -> SENT",
    timestamp: new Date().toISOString(),
  });

  // Revalidate to update the UI on Review Board
  revalidatePath(`/jobs/manage/${jobId}`);
  revalidatePath(`/job-offer/${applicationId}`);
  revalidatePath(`/job-offer/${offer.id}`);
  revalidatePath(`/offer-signing`);
  revalidatePath(`/applications/${applicationId}`);
  return {
    success: true,
    offerId: offer.id,
    signedDocId: signedDoc.id,
    docusealUrl,
  };
}
