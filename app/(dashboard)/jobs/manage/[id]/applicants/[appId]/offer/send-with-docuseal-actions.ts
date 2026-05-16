"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { createJobOfferTemplate, fetchDocusealTemplate, getDocusealApiBaseUrl } from "@/lib/docuseal";
import { createClient } from "@/lib/supabase/server";

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
  const userClient = await createClient();

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

    // Fetch the job_offers record to get the current status
    const { data: jobOffer, error: offerError } = await supabase
      .from("job_offers")
      .select("id, status, latest_docuseal_url")
      .eq("id", offerId)
      .single();

    if (offerError || !jobOffer) {
      return { error: "Offer not found", success: false };
    }

    // Only process if offer is in a "sendable" state
    if (!["DRAFT", "SENT", "NEGOTIATION_PENDING"].includes(jobOffer.status)) {
      return { error: "Offer is not in a valid state to send", success: false };
    }

    // If submission URL already exists, return early
    if (jobOffer.latest_docuseal_url) {
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

    // Create DocuSeal submission
    const docusealUrl = `${getDocusealApiBaseUrl()}/submissions`;
    const candidateName = [candidate.first_name, candidate.last_name]
      .filter(Boolean)
      .join(" ") || "Candidate";
    const parsedTemplateId = Number(templateId);

    if (!Number.isInteger(parsedTemplateId)) {
      return { error: `Invalid template ID: ${templateId}`, success: false };
    }

    const submissionPayload = {
      template_id: parsedTemplateId,
      send_email: true,
      submitters: [
        {
          role: "Candidate",
          email: candidate.email,
          name: candidateName,
          external_id: offerId,
          fields: [
            {
              name: "candidate_name",
              default_value: candidateName,
            },
          ],
        },
      ],
    };

    let docusealResponse: Response;
    try {
      docusealResponse = await fetch(docusealUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": process.env.DOCUSEAL_API_KEY || "",
        },
        body: JSON.stringify(submissionPayload),
      });
    } catch (submissionError) {
      const errorMessage = submissionError instanceof Error ? submissionError.message : String(submissionError);
      console.error("DocuSeal submission request failed:", {
        error: errorMessage,
        templateId: parsedTemplateId,
        offerId,
        applicationId,
      });
      return { error: `Failed to contact DocuSeal: ${errorMessage}`, success: false };
    }

    if (!docusealResponse.ok) {
      const errorData = await docusealResponse.text();
      let providerError = errorData || docusealResponse.statusText || "Unknown DocuSeal error";

      try {
        const parsedError = JSON.parse(errorData) as { error?: string; message?: string; detail?: string };
        providerError = parsedError.detail || parsedError.message || parsedError.error || providerError;
      } catch {
        // Keep the raw response text when DocuSeal does not return JSON.
      }

      console.error("DocuSeal API error:", {
        status: docusealResponse.status,
        statusText: docusealResponse.statusText,
        providerError,
        rawResponse: errorData,
        submissionPayload,
      });
      return { error: `Failed to create DocuSeal submission: ${providerError}`, success: false };
    }

    const docusealData = await docusealResponse.json();

    // Extract submission URL from response
    const docusealSubmissionUrl =
      docusealData?.submission?.url ||
      (Array.isArray(docusealData) && docusealData[0]?.embed_src) ||
      docusealData?.embed_src ||
      null;

    if (!docusealSubmissionUrl) {
      console.error("DocuSeal response missing submission URL:", docusealData);
      return { error: "DocuSeal submission created but no signing URL returned", success: false };
    }

    // Update job_offers with the submission URL
    const { error: updateError } = await supabase
      .from("job_offers")
      .update({
        latest_docuseal_url: docusealSubmissionUrl,
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
      // Ensure we have a contract_templates record to satisfy the NOT NULL constraint
      let contractTemplateId: string | null = null;
      const templateKey = String(docusealTemplateId || "").trim();
      if (templateKey) {
        const { data: existingTemplate } = await supabase
          .from("contract_templates")
          .select("id")
          .eq("docuseal_template_id", templateKey)
          .maybeSingle();

        if (existingTemplate) {
          contractTemplateId = existingTemplate.id;
        } else {
          const { data: newTemplate } = await supabase
            .from("contract_templates")
            .insert({
              job_posting_id: job.id,
              template_name: `Template ${templateKey}`,
              docuseal_template_id: templateKey,
              external_id: templateKey,
              created_by: job.created_by,
            })
            .select("id")
            .single();
          contractTemplateId = newTemplate?.id ?? null;
        }
      }

      const { data: signedDoc, error: signedDocError } = await supabase
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
        console.error("Failed to create signed_documents placeholder:", signedDocError);
      } else {
        // Update signed_documents with the DocuSeal URL and metadata containing the job_offers id
        await supabase
          .from("signed_documents")
          .update({
            docuseal_submission_url: docusealSubmissionUrl,
            metadata: {
              ...(jobOffer?.metadata ?? {}),
              job_offer_id: offerId,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", signedDoc.id);

        // Link application -> signed_documents for legacy lookups
        await supabase
          .from("applications")
          .update({ status: "offer_sent", contract_offer_id: signedDoc.id })
          .eq("id", applicationId);
      }
    } catch (err) {
      console.warn("Non-fatal: failed to persist signed_documents or application link:", err);
    }

    return { success: true, url: docusealSubmissionUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("sendOfferWithDocuSeal error:", errorMessage, error);
    return { error: `An unexpected error occurred: ${errorMessage}`, success: false };
  }
}
