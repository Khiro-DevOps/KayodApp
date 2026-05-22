"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { createDocusealSubmission, createJobOfferTemplate, fetchDocusealTemplate } from "@/lib/docuseal";
import { createSignedDocumentPlaceholderWithTemplateFallback } from "@/lib/contract-template-compat";

/**
 * Creates a DocuSeal submission for a job offer stored in job_offers table
 * and updates the job_offers record with the submission URL
 */
export async function sendOfferWithDocuSeal(
  jobId: string,
  applicationId: string,
  offerId: string
) {
  const supabase = getAdminClient();

  try {
    // Fetch application and candidate details
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, candidate_id, job_posting_id, status")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return { error: "Application not found", success: false };
    }

    // Fetch candidate profile
    const { data: candidate, error: candidateError } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", application.candidate_id)
      .single();

    if (candidateError || !candidate?.email) {
      return { error: "Candidate email not found", success: false };
    }

    // Fetch job posting
    const { data: job, error: jobError } = await supabase
      .from("job_postings")
      .select(
        "id, title, created_by, docuseal_template_id, description, employment_type, location, salary_min, salary_max, job_category, offer_letter_settings"
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return { error: "Job posting not found", success: false };
    }

    const { data: creatorProfile, error: creatorProfileError } = await supabase
      .from("profiles")
      .select("tenants(id, name)")
      .eq("id", job.created_by)
      .single();

    if (creatorProfileError) {
      console.warn("Failed to resolve company name for offer metadata:", creatorProfileError);
    }

    const companyName = (creatorProfile?.tenants as { name?: string | null } | null)?.name ?? null;

    // Fetch the job_offers record to get the current status
    const { data: jobOffer, error: offerError } = await supabase
      .from("job_offers")
      .select("id, status, latest_docuseal_url, job_metadata, start_date")
      .eq("id", offerId)
      .single();

    if (offerError || !jobOffer) {
      return { error: "Offer not found", success: false };
    }

    const offerMetadata = (jobOffer.job_metadata as Record<string, unknown> | null) ?? {};
    const offerStartDate = jobOffer.start_date ?? job.offer_letter_settings?.phStartDate ?? null;
    const nextJobMetadata = {
      ...offerMetadata,
      company_name: companyName ?? offerMetadata.company_name ?? null,
      start_date: offerStartDate ?? offerMetadata.start_date ?? null,
      job_title: job.title,
    };

    // Only process if offer is in a "sendable" state
    if (!["DRAFT", "SENT", "NEGOTIATION_PENDING"].includes(jobOffer.status)) {
      return { error: "Offer is not in a valid state to send", success: false };
    }

    // If submission URL already exists, return early
    if (jobOffer.latest_docuseal_url) {
      if (!offerMetadata.company_name || !offerMetadata.start_date) {
        await supabase
          .from("job_offers")
          .update({
            job_metadata: nextJobMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", offerId);
      }

      return { success: true, url: jobOffer.latest_docuseal_url };
    }

    // Get or create DocuSeal template
    let docusealTemplateId = job.docuseal_template_id;
    if (!docusealTemplateId) {
      if (!process.env.DOCUSEAL_API_KEY) {
        return { error: "DocuSeal API key not configured", success: false };
      }

      try {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name, tenant_id, tenants(id, name)")
          .eq("id", job.created_by)
          .single();

        if (profileError || !profile) {
          return { error: "Failed to retrieve company profile", success: false };
        }

        const tenantData = profile?.tenants as any;
        const companyName = tenantData?.name;

        if (!companyName) {
          return { error: "Company profile incomplete", success: false };
        }

        const templateId = await createJobOfferTemplate(
          {
            jobTitle: job.title,
            employmentType: job.employment_type || "Full-time",
            location: job.location || "",
            jobDescription: job.description || "",
            salary_min: job.salary_min || undefined,
            salary_max: job.salary_max || undefined,
          },
          {
            name: companyName,
            email: profile?.email || "noreply@kayod.app",
          },
          job.offer_letter_settings as any
        );

        if (!templateId) {
          return { error: "Template creation failed", success: false };
        }

        docusealTemplateId = templateId;

        // Update the job posting with the new template ID
        await supabase
          .from("job_postings")
          .update({ docuseal_template_id: docusealTemplateId })
          .eq("id", jobId);
      } catch (templateError) {
        const errorMessage = templateError instanceof Error ? templateError.message : String(templateError);
        return { error: `Failed to create contract template: ${errorMessage}`, success: false };
      }
    }

    if (!docusealTemplateId) {
      return { error: "No DocuSeal template configured", success: false };
    }

    const templateId = String(docusealTemplateId).trim();
    const docusealTemplate = await fetchDocusealTemplate({ templateId });
    if (!docusealTemplate.fieldCount) {
      return {
        error: "DocuSeal template contains no fields. Please add fields to the template.",
        success: false,
      };
    }

    const candidateName = [candidate.first_name, candidate.last_name]
      .filter(Boolean)
      .join(" ") || "Candidate";
    const submission = await createDocusealSubmission({
      templateId,
      submitterName: candidateName,
      submitterEmail: candidate.email,
      externalId: offerId,
      sendEmail: false,
      prefillFields: {
        // Field names must EXACTLY match the name="" attributes in DocuSeal template tags
        "job_title": job.title,
        "company_name": companyName ?? "",
        "candidate_name": candidateName,
        ...(offerStartDate && { "date_signed": offerStartDate }),
        ...(job.employment_type && { "employment_type": job.employment_type }),
        ...(job.location && { "location": job.location }),
      },
    });

    if (!submission.viewerUrl || !submission.embedSrc) {
      return { error: "DocuSeal submission did not return signing URLs", success: false };
    }

    // Update job_offers with the submission URL
    const { error: updateError } = await supabase
      .from("job_offers")
      .update({
        latest_docuseal_url: submission.viewerUrl,
        job_metadata: nextJobMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", offerId);

    if (updateError) {
      console.error("Failed to update job_offers with submission URL:", updateError);
      return { error: "Offer updated but failed to save signing link", success: false };
    }

    // Create a signed_documents placeholder and link it back to the application so
    // legacy pages that resolve via `applications.contract_offer_id` continue to work.
    try {
      const { signedDocumentId } = await createSignedDocumentPlaceholderWithTemplateFallback(supabase, {
        applicationId,
        jobPostingId: job.id,
        docusealTemplateId,
        createdBy: job.created_by,
        signingMethod: "digital",
        status: "sent",
        metadata: {
          ...(jobOffer?.job_metadata ?? {}),
          docuseal_submission_id: submission.submitterId ?? submission.slug,
          docuseal_embed_src: submission.embedSrc,
          docuseal_viewer_url: submission.viewerUrl,
          company_name: companyName,
          start_date: job.offer_letter_settings?.phStartDate ?? null,
          job_title: job.title,
          job_offer_id: offerId,
        },
      });

      await supabase
        .from("signed_documents")
        .update({
          docuseal_submission_url: submission.viewerUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", signedDocumentId);

      // Link application -> signed_documents for legacy lookups
      await supabase
        .from("applications")
        .update({ status: "offer_sent", contract_offer_id: signedDocumentId })
        .eq("id", applicationId);
    } catch (err) {
      console.warn("Non-fatal: failed to persist signed_documents or application link:", err);
    }

    return { success: true, url: submission.viewerUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("sendOfferWithDocuSeal error:", errorMessage, error);
    return { error: `An unexpected error occurred: ${errorMessage}`, success: false };
  }
}
