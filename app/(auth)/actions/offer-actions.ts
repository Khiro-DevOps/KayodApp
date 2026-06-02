"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendOfferWithDocuSeal } from "../../(dashboard)/hr/jobs/[id]/applicants/[appId]/offer/send-with-docuseal-actions";
import { createSignedDocumentPlaceholderWithTemplateFallback } from "@/lib/contract-template-compat";

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
    .select("tenant_id")
    .eq("id", job.created_by)
    .single();

  if (creatorProfileError) {
    console.warn("[sendHydratedOffer] Failed to resolve tenant id:", creatorProfileError);
  }

  const { data: creatorTenant } = creatorProfile?.tenant_id
    ? await supabase.from("tenants").select("name").eq("id", creatorProfile.tenant_id).single()
    : { data: null };

  const tenantName = creatorTenant?.name ?? null;

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
      job_posting_id: jobId,
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
        company_name: tenantName,
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

  const { data: linkedApplication } = await admin
    .from("applications")
    .select("contract_offer_id")
    .eq("id", applicationId)
    .single();

  const linkedSignedDocumentId = linkedApplication?.contract_offer_id ?? null;

  if (linkedSignedDocumentId) {
    const { error: offerUpdateError } = await admin
      .from("job_offers")
      .update({ status: "SENT", updated_at: new Date().toISOString() })
      .eq("id", offer.id);

    if (offerUpdateError) {
      throw new Error(`DocuSeal submission was created, but the job offer status could not be updated: ${offerUpdateError.message}`);
    }

    revalidatePath(`/jobs/manage/${jobId}`);
    revalidatePath(`/jobs/manage/${jobId}/applicants`);
    revalidatePath(`/job-offer/${applicationId}`);
    revalidatePath(`/job-offer/${offer.id}`);
    revalidatePath(`/offer-signing`);
    revalidatePath(`/applications/${applicationId}`);

    return {
      success: true,
      offerId: offer.id,
      signedDocId: linkedSignedDocumentId,
      docusealUrl: sendResult.url ?? null,
    };
  }

  // At this point the external DocuSeal submission was created; finalize by creating
  // a signed_documents row and only then update job_offers + applications. If any
  // of these steps fail, rollback the created job_offers to avoid a partial state
  // where application.status === 'offer_sent' but no offer exists.

  // Create a signed_documents placeholder using the same minimal shape as the working legacy flow.
  let signedDocId: string;
  try {
    const result = await createSignedDocumentPlaceholderWithTemplateFallback(admin, {
      applicationId,
      jobPostingId: jobId,
      docusealTemplateId: String(job.docuseal_template_id || "").trim(),
      createdBy: job.created_by,
      signingMethod: "digital",
      status: "sent",
      metadata: {
        job_offer_id: offer.id,
      },
    });

    signedDocId = result.signedDocumentId;
  } catch (signedDocError) {
    // Rollback created job offer to avoid partial state
    await admin.from("job_offers").delete().eq("id", offer.id);
    throw new Error(
      `Failed to create signed_documents placeholder: ${signedDocError instanceof Error ? signedDocError.message : "unknown error"}`
    );
  }

  const docusealUrl = sendResult.url ?? null;

  // Update signed_documents, mark job_offer as SENT, then update applications.
  try {
    const { error: signedDocumentUpdateError } = await admin
      .from("signed_documents")
      .update({
        docuseal_submission_url: docusealUrl,
        metadata: {
          job_offer_id: offer.id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", signedDocId);

    if (signedDocumentUpdateError) {
      throw new Error(`DocuSeal submission was created, but the signed document record could not be updated: ${signedDocumentUpdateError.message}`);
    }

    const { error: jobOfferUpdateError } = await admin
      .from("job_offers")
      .update({ status: "SENT", updated_at: new Date().toISOString() })
      .eq("id", offer.id);

    if (jobOfferUpdateError) {
      throw new Error(`DocuSeal submission was created, but the job offer status could not be updated: ${jobOfferUpdateError.message}`);
    }

    const { error: applicationUpdateError } = await admin
      .from("applications")
      .update({ status: "offer_sent", contract_offer_id: signedDocId, updated_at: new Date().toISOString() })
      .eq("id", applicationId);

    if (applicationUpdateError) {
      throw new Error(`DocuSeal submission was created, but the application status could not be updated: ${applicationUpdateError.message}`);
    }
  } catch (err) {
    console.error("sendHydratedOffer: failed to finalize offer, rolling back", err);
    // Rollback both signed_documents and job_offers to avoid partial state
    await admin.from("signed_documents").delete().eq("id", signedDocId);
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
  revalidatePath(`/jobs/manage/${jobId}/applicants`);
  revalidatePath(`/job-offer/${applicationId}`);
  revalidatePath(`/job-offer/${offer.id}`);
  revalidatePath(`/offer-signing`);
  revalidatePath(`/applications/${applicationId}`);
  return {
    success: true,
    offerId: offer.id,
    signedDocId,
    docusealUrl,
  };
}

// Create a hydrated draft offer (DRAFT) but do not send to DocuSeal.
export async function createHydratedOfferDraft(jobId: string, applicationId: string) {
  try {
    const supabase = await createClient();
    const admin = getAdminClient();

    const { data: job, error: jobError } = await supabase
      .from("job_postings")
      .select("title, work_setup, salary_min, offer_letter_settings, docuseal_template_id, created_by")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error("Job fetch error:", jobError);
      return { success: false, error: `Failed to fetch job blueprint: ${jobError?.message ?? "unknown error"}` };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Must be logged in to create an offer draft" };
    }

    const { data: creatorProfile, error: creatorProfileError } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", job.created_by)
      .single();

    if (creatorProfileError) {
      console.warn("[createHydratedOfferDraft] Failed to resolve tenant id:", creatorProfileError);
    }

    const { data: creatorTenant } = creatorProfile?.tenant_id
      ? await supabase.from("tenants").select("name").eq("id", creatorProfile.tenant_id).single()
      : { data: null };

    const tenantName = creatorTenant?.name ?? null;

    const { data: existingOffers, error: existingOfferError } = await admin
      .from("job_offers")
      .select("id, version_id, created_by")
      .eq("application_id", applicationId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (existingOfferError) {
      console.error("Offer draft lookup error:", existingOfferError);
      return { success: false, error: `Failed to look up existing offer draft: ${existingOfferError.message}` };
    }

    const existingOffer = existingOffers?.[0] ?? null;
    const draftPayload = {
      application_id: applicationId,
      job_posting_id: jobId,
      status: "DRAFT",
      version_id: (existingOffer?.version_id ?? 0) + 1,
      is_active: true,
      created_by: existingOffer?.created_by ?? user.id,
      salary: job.offer_letter_settings?.phMonthlyBasicSalary || job.salary_min || 0,
      start_date: job.offer_letter_settings?.phStartDate || null,
      work_setup: job.work_setup || "Remote",
      department: job.offer_letter_settings?.phDepartment || null,
      probation_days: job.offer_letter_settings?.phProbationPeriodDays || 180,
      job_metadata: {
        company_name: tenantName,
        start_date: job.offer_letter_settings?.phStartDate || null,
        job_title: job.title,
        // include any selected benefits if present in job.offer_letter_settings
        benefits: job.offer_letter_settings?.selectedBenefits ?? null,
      },
    };

    const offerQuery = existingOffer
      ? admin.from("job_offers").update(draftPayload).eq("id", existingOffer.id)
      : admin.from("job_offers").insert(draftPayload);

    const { data: offer, error: offerError } = await offerQuery.select().single();

    if (offerError || !offer) {
      console.error("Offer draft creation error:", offerError);
      return { success: false, error: `Failed to generate offer draft: ${offerError?.message ?? "unknown error"}` };
    }

    return { success: true, offer };
  } catch (error) {
    console.error("createHydratedOfferDraft error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create offer draft",
    };
  }
}

// Update fields on an existing draft offer. Accepts a partial updates object.
export async function updateOfferDraft(offerId: string, updates: Record<string, unknown>) {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("job_offers")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .select()
    .single();

  if (error) {
    console.error("updateOfferDraft error:", error);
    return { success: false, error: error.message };
  }

  return { success: true, offer: data };
}

// Send an existing draft offer via DocuSeal and finalize records.
export async function sendDraftOffer(jobId: string, applicationId: string, offerId: string) {
  const admin = getAdminClient();
  const supabase = await createClient();

  // Dispatch DocuSeal submission
  const sendResult = await sendOfferWithDocuSeal(jobId, applicationId, offerId);
  if (!sendResult.success) {
    console.error(`DocuSeal integration failed: ${sendResult.error}`);
    throw new Error(`Failed to send contract via DocuSeal: ${sendResult.error}`);
  }

  // Create signed_documents placeholder
  let signedDocId: string;
  try {
    const { data: job } = await supabase
      .from("job_postings")
      .select("docuseal_template_id, created_by")
      .eq("id", jobId)
      .single();

    const result = await createSignedDocumentPlaceholderWithTemplateFallback(admin, {
      applicationId,
      jobPostingId: jobId,
      docusealTemplateId: String(job?.docuseal_template_id ?? "").trim(),
      createdBy: job?.created_by ?? "",
      signingMethod: "digital",
      status: "sent",
      metadata: { job_offer_id: offerId },
    });

    signedDocId = result.signedDocumentId;
  } catch (signedDocError) {
    throw new Error(
      `Failed to create signed_documents placeholder: ${signedDocError instanceof Error ? signedDocError.message : "unknown error"}`
    );
  }

  const docusealUrl = sendResult.url ?? null;

  try {
    await admin
      .from("signed_documents")
      .update({ docuseal_submission_url: docusealUrl, metadata: { job_offer_id: offerId }, updated_at: new Date().toISOString() })
      .eq("id", signedDocId);

    await admin.from("job_offers").update({ status: "SENT", updated_at: new Date().toISOString() }).eq("id", offerId);

    await admin
      .from("applications")
      .update({ status: "offer_sent", contract_offer_id: signedDocId, updated_at: new Date().toISOString() })
      .eq("id", applicationId);

    revalidatePath(`/jobs/manage/${jobId}/applicants`);
    revalidatePath(`/jobs/manage/${jobId}/applicants/${applicationId}`);
    revalidatePath(`/job-offer/${applicationId}`);
  } catch (err) {
    console.error("sendDraftOffer: failed to finalize offer", err);
    throw new Error("Failed to finalize offer creation; no changes were applied. Please try again.");
  }

  return { success: true, offerId, signedDocId, docusealUrl };
}
