"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { createJobOfferTemplate, fetchDocusealTemplate, getDocusealApiBaseUrl } from "@/lib/docuseal";

export async function sendJobOfferLetter(jobId: string, applicationId: string) {
  const supabase = getAdminClient();

  try {
    // Fetch the application and candidate details
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, candidate_id, job_posting_id, status")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      console.error(`sendJobOfferLetter: application lookup failed`, {
        jobId,
        applicationId,
        appError: appError?.message ?? appError,
      });
      return { error: "Application not found", success: false };
    }

    // Fetch the job and verify template exists
    const { data: job, error: jobError } = await supabase
      .from("job_postings")
      .select(
        "id, title, created_by, docuseal_template_id, description, employment_type, location, salary_min, salary_max, job_category, offer_letter_settings"
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error(`sendJobOfferLetter: job lookup failed`, {
        jobId,
        applicationId,
        jobError: jobError?.message ?? jobError,
      });
      return { error: "Job posting not found", success: false };
    }

    const { data: creatorProfile, error: creatorProfileError } = await supabase
      .from("profiles")
      .select("tenants(id, name)")
      .eq("id", job.created_by)
      .single();

    if (creatorProfileError) {
      console.warn("sendJobOfferLetter: failed to resolve company name", creatorProfileError);
    }

    const companyName = (creatorProfile?.tenants as { name?: string | null } | null)?.name ?? null;

    // If no template exists and we have DocuSeal API key, create one
    let docusealTemplateId = job.docuseal_template_id;
    if (!docusealTemplateId) {
      if (!process.env.DOCUSEAL_API_KEY) {
        return {
          error: "DocuSeal API key not configured. Please set DOCUSEAL_API_KEY in your environment variables.",
          success: false,
        };
      }

      try {
        // Fetch HR profile with tenant details via FK to tenants table
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name, tenant_id, tenants(id, name)")
          .eq("id", job.created_by)
          .single();

        if (profileError) {
          console.error("sendJobOfferLetter: unable to fetch creator profile", { profileError });
          return {
            error: "Failed to retrieve company profile for template creation",
            success: false,
          };
        }

        // Get company name from the linked tenants table
        const tenantData = profile?.tenants as any;
        const companyName = tenantData?.name;

        if (!companyName) {
          console.error("sendJobOfferLetter: no company name found via tenant_id", { profile });
          return {
            error: "Company profile incomplete - tenant information not found",
            success: false,
          };
        }

        console.log(`Creating DocuSeal template for job ${jobId} with company: "${companyName}"`);
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
          console.error("DocuSeal template creation returned no ID");
          return {
            error: "Template creation failed - no template ID returned",
            success: false,
          };
        }

        docusealTemplateId = templateId;
        console.log(`Updating job with template ID: ${templateId}`);

        // Update the job posting with the new template ID
        const { error: updateError } = await supabase
          .from("job_postings")
          .update({ docuseal_template_id: docusealTemplateId })
          .eq("id", jobId);

        if (updateError) {
          console.error("Failed to save template ID to job posting", { updateError });
          // Don't return error - template exists, just wasn't saved to DB
        }
      } catch (templateError) {
        const errorMessage = templateError instanceof Error ? templateError.message : String(templateError);
        console.error("Error creating DocuSeal template:", { errorMessage, templateError });
        return {
          error: `Failed to create contract template: ${errorMessage}`,
          success: false,
        };
      }
    }

    if (!docusealTemplateId) {
      return {
        error: "No DocuSeal template configured. Please set up contract templates in your HR settings.",
        success: false,
      };
    }

    const templateId = String(docusealTemplateId).trim();
    if (!templateId) {
      return {
        error: "No DocuSeal template configured. Please set up contract templates in your HR settings.",
        success: false,
      };
    }

    const docusealTemplate = await fetchDocusealTemplate({ templateId });
    if (!docusealTemplate.fieldCount) {
      console.error("DocuSeal template has no fields", {
        jobId,
        applicationId,
        templateId: docusealTemplate.id,
        templateName: docusealTemplate.name,
      });

      return {
        error:
          "DocuSeal template contains no fields. Open the template in DocuSeal, add at least one field, save it, then try again.",
        success: false,
      };
    }

    console.log("DocuSeal template validation passed", {
      jobId,
      applicationId,
      templateId: docusealTemplate.id,
      templateName: docusealTemplate.name,
      fieldCount: docusealTemplate.fieldCount,
    });

    // Fetch applicant email
    const { data: applicant, error: applicantError } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", application.candidate_id)
      .single();

    if (applicantError || !applicant?.email) {
      console.error("sendJobOfferLetter: applicant lookup failed", { applicantError, application });
      return { error: "Applicant email not found", success: false };
    }

    // Create the job offer submission via DocuSeal
    const docusealUrl = `${getDocusealApiBaseUrl()}/submissions`;
    const applicantName = [applicant.first_name, applicant.last_name]
      .filter(Boolean)
      .join(" ") || "Applicant";
    const parsedTemplateId = Number(templateId);
    if (!Number.isInteger(parsedTemplateId)) {
      return {
        error: `DocuSeal template ID is invalid: ${templateId}`,
        success: false,
      };
    }

    // 1. Get or create contract_template
    let contractTemplateId = null;
    const { data: existingTemplate } = await supabase
      .from("contract_templates")
      .select("id")
      .eq("docuseal_template_id", parsedTemplateId.toString())
      .maybeSingle();

    if (existingTemplate) {
      contractTemplateId = existingTemplate.id;
    } else {
      const { data: newTemplate } = await supabase
        .from("contract_templates")
        .insert({
          job_posting_id: jobId,
          template_name: `Template ${parsedTemplateId}`,
          docuseal_template_id: parsedTemplateId.toString(),
          external_id: parsedTemplateId.toString(),
          created_by: job.created_by
        })
        .select("id")
        .single();
      contractTemplateId = newTemplate?.id;
    }

    // 2. Create signed_documents placeholder so we have an ID for external_id
    const { data: signedDoc, error: signedDocError } = await supabase
      .from("signed_documents")
      .insert({
        application_id: applicationId,
        contract_template_id: contractTemplateId,
        signing_method: "digital",
        status: "sent"
      })
      .select("id")
      .single();

    if (signedDocError || !signedDoc) {
      console.error("sendJobOfferLetter: Failed to create signed_documents", signedDocError);
      return { error: "Failed to initialize signing process", success: false };
    }

    // Link application to the new signed document
    await supabase
      .from("applications")
      .update({ contract_offer_id: signedDoc.id })
      .eq("id", applicationId);

    const submissionPayload = {
      template_id: parsedTemplateId,
      send_email: true,
      submitters: [
        {
          role: "Candidate",
          email: applicant.email,
          name: applicantName,
          external_id: signedDoc.id,
          fields: [
            {
              name: "candidate_name",
              default_value: applicantName,
            },
          ],
        },
      ],
    };

    const docusealResponse = await fetch(docusealUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": process.env.DOCUSEAL_API_KEY || "",
      },
      body: JSON.stringify(submissionPayload),
    });

    if (!docusealResponse.ok) {
      const errorData = await docusealResponse.text();
      console.error("DocuSeal API error:", errorData);
      return { error: "Failed to send offer via DocuSeal", success: false };
    }

    const docusealData = await docusealResponse.json();

    // Log raw response for debugging
    try {
      console.log("[sendJobOfferLetter] Raw DocuSeal response:", JSON.stringify(docusealData));
    } catch (e) {
      console.log("[sendJobOfferLetter] Raw DocuSeal response (non-serializable)");
    }

    // Extract submission id from common response shapes
    const submissionId =
      docusealData?.id || docusealData?.submission?.id || (Array.isArray(docusealData) && docusealData[0]?.id) ||
      (Array.isArray(docusealData) && docusealData[0]?.submission?.id) || null;

    console.log("[sendJobOfferLetter] DocuSeal submission created successfully", {
      jobId,
      applicationId,
      submissionId,
      externalId: submissionPayload.submitters[0].external_id,
      timestamp: new Date().toISOString(),
    });

    const docusealSubmissionUrl = docusealData?.submission?.url || (Array.isArray(docusealData) && docusealData[0]?.submission?.url) || docusealData?.url || null;

    // Update signed_documents with the URL from DocuSeal
    await supabase
      .from("signed_documents")
      .update({
        docuseal_submission_url: docusealSubmissionUrl,
        metadata: {
          docuseal_submission_id: submissionId,
          company_name: companyName,
          start_date: job.offer_letter_settings?.phStartDate ?? null,
          job_title: job.title,
        }
      })
      .eq("id", signedDoc.id);

    // Mark the application as having an active offer so the signing route can resolve it.
    const { data: updatedRows, error: updateError } = await supabase
      .from("applications")
      .update({
        status: "offer_sent",
        contract_offer_id: signedDoc.id,
      })
      .eq("id", applicationId)
      .select("id");

    if (updateError) {
      console.error("sendJobOfferLetter: failed to update applications", { updateError });
      return { error: "Failed to update offer status", success: false };
    }

    console.log("[sendJobOfferLetter] application status updated to offer_sent", {
      applicationId,
      status: "offer_sent",
      docusealSubmissionId: submissionId,
      updatedRowsCount: Array.isArray(updatedRows) ? updatedRows.length : 0,
      timestamp: new Date().toISOString(),
    });

    // Verify notification was created by checking notifications with matching action_url
    const actionUrl = `/applications/${applicationId}`;
    const { data: notifications, error: notifError } = await supabase
      .from("notifications")
      .select("id, type, recipient_id, created_at, action_url")
      .eq("type", "offer_letter")
      .eq("action_url", actionUrl)
      .order("created_at", { ascending: false })
      .limit(1);

    if (notifError) {
      console.warn("[sendJobOfferLetter] Failed to verify notification creation", { notifError });
    } else if (!notifications || notifications.length === 0) {
      console.warn("[sendJobOfferLetter] No 'offer_letter' notification found for application. Database trigger may not have fired.", {
        applicationId,
        jobId,
      });
      try {
        const { error: insertError } = await supabase.from("notifications").insert({
          recipient_id: application.candidate_id,
          sender_id: job.created_by,
          type: "offer_letter",
          title: `Job Offer for ${job.title}`,
          body: "You have received a job offer. Review the contract and accept or decline.",
          action_url: actionUrl,
          is_read: false,
        });

        if (insertError) {
          console.error("[sendJobOfferLetter] Fallback notification insert failed", { insertError });
        } else {
          console.log("[sendJobOfferLetter] Fallback notification inserted successfully for candidate", {
            applicationId,
            recipient: application.candidate_id,
          });
        }
      } catch (e) {
        console.error("[sendJobOfferLetter] Error inserting fallback notification", e);
      }
    } else {
      console.log("[sendJobOfferLetter] Notification verified", {
        notificationId: notifications[0].id,
        recipientId: notifications[0].recipient_id,
        createdAt: notifications[0].created_at,
        actionUrl: notifications[0].action_url,
      });
    }

    return {
      success: true,
      message: "Offer sent successfully",
      docusealSubmissionId: submissionId,
    };
  } catch (error) {
    console.error("Error sending job offer letter:", error);
    return {
      error: error instanceof Error ? error.message : "Unexpected error",
      success: false,
    };
  }
}
