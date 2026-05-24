"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createDocusealSubmission } from "@/lib/docuseal";

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

    const { data: job, error: jobError } = await supabase
      .from("job_postings")
      .select("id, title, docuseal_template_id, created_by")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error(jobError?.message ?? "Job posting not found");
    }

    const { data: application, error: applicationError } = await supabase
      .from("applications")
      .select("id, candidate_id, profiles!applications_candidate_id_fkey (first_name, last_name, email)")
      .eq("id", applicationId)
      .single();

    if (applicationError || !application) {
      throw new Error(applicationError?.message ?? "Application not found");
    }

    const candidate = (application.profiles as {
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

    const templateId = String(job.docuseal_template_id ?? "").trim();
    if (!templateId) {
      throw new Error("Job posting is missing a DocuSeal template ID");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "http://localhost:3000";
    const submission = await createDocusealSubmission({
      templateId,
      submitterName: candidateName,
      submitterEmail: candidateEmail,
      externalId: offerId,
      sendEmail: true,
      redirectUrl: `${appUrl}/applications/${applicationId}`,
    });

    await admin
      .from("job_offers")
      .update({ latest_docuseal_url: submission.signingUrl, updated_at: new Date().toISOString() })
      .eq("id", offerId);

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
