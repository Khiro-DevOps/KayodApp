"use server";

import { revalidatePath } from "next/cache";
import { resolveCompanyLogoUrlForUser } from "@/lib/company-logos";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { buildOfferPrefillFields, createDocusealSubmission } from "@/lib/docuseal";
import { ensureOfferTemplate } from "@/lib/docuseal-actions";

type SendOfferWithDocuSealResult =
  | {
      success: true;
      url: string;
    }
  | {
      success: false;
      error: string;
    };

export async function sendOfferWithDocuSeal(
  jobId: string,
  applicationId: string,
  offerId: string
): Promise<SendOfferWithDocuSealResult> {
  try {
    const supabase = await createClient();
    const admin = getAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Must be logged in to send an offer");
    }

    const { data: job, error: jobError } = await supabase
      .from("job_postings")
      .select("id, title, location, currency, docuseal_template_id, created_by")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error(jobError?.message ?? "Job posting not found");
    }

    const { data: application, error: applicationError } = await supabase
      .from("job_applications")
      .select("id, applicant_id, job_id, profiles!job_applications_applicant_id_fkey (first_name, last_name, email)")
      .eq("id", applicationId)
      .single();

    if (applicationError || !application) {
      throw new Error(applicationError?.message ?? "Application not found");
    }

    const rawProfile = Array.isArray(application.profiles) ? application.profiles[0] : application.profiles;
    const candidate = (rawProfile as {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
    } | null) ?? null;

    const candidateName = [candidate?.first_name, candidate?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Candidate";

    const candidateEmail = candidate?.email?.trim();
    if (!candidateEmail) {
      throw new Error("Candidate email is required to send a DocuSeal offer");
    }

    const { data: offerRow, error: offerError } = await admin
      .from("job_offers")
      .select("id, salary, start_date, work_setup, work_mode, work_location_id, department, probation_days, job_metadata, metadata")
      .eq("id", offerId)
      .single();

    if (offerError || !offerRow) {
      throw new Error(offerError?.message ?? "Job offer not found");
    }

    const { data: branchRow } = offerRow.work_location_id
      ? await admin
          .from("office_branches")
          .select("id, name, address")
          .eq("id", offerRow.work_location_id)
          .maybeSingle()
      : { data: null };

    const { data: creatorProfile } = job.created_by
      ? await admin
          .from("profiles")
          .select("tenant_id")
          .eq("id", job.created_by)
          .maybeSingle()
      : { data: null };

    const { data: tenantRow } = creatorProfile?.tenant_id
      ? await admin
          .from("tenants")
          .select("name")
          .eq("id", creatorProfile.tenant_id)
          .maybeSingle()
      : { data: null };

    const templateId = await ensureOfferTemplate(jobId);
    const prefillFields = buildOfferPrefillFields(
      offerRow,
      {
        title: job.title,
        currency: job.currency,
        location: job.location,
        company_name: tenantRow?.name ?? null,
      },
      candidate,
      branchRow
    );

    const companyLogoUrl = await resolveCompanyLogoUrlForUser(user.id);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "http://localhost:3000";
    const submission = await createDocusealSubmission({
      templateId,
      submitterName: candidateName,
      submitterEmail: candidateEmail,
      externalId: offerId,
      sendEmail: true,
      redirectUrl: `${appUrl}/applications/${applicationId}`,
      companyLogoUrl,
      prefillFields,
    });

    const { error: updateError } = await admin
      .from("job_offers")
      .update({ latest_docuseal_url: submission.signingUrl, updated_at: new Date().toISOString() })
      .eq("id", offerId);

    if (updateError) {
      throw new Error(`DocuSeal submission was created, but the job offer record could not be updated: ${updateError.message}`);
    }

    revalidatePath(`/hr/jobs/${jobId}/applicants`);

    return {
      success: true,
      url: submission.signingUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send offer via DocuSeal";
    console.error("[sendOfferWithDocuSeal]", { jobId, applicationId, offerId, error: message });
    return {
      success: false,
      error: message,
    };
  }
}
