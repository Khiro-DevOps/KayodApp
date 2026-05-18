import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import ApplicantsHubClient from "./applicants-list-client";
import type { Interview, Profile } from "@/lib/types";
import Link from "next/link";
import { effectiveRole, isHRRole } from "@/lib/roles";

type JobOfferRow = {
  id: string;
  application_id: string;
  status: string;
  salary: number | null;
  start_date: string | null;
  work_setup: string | null;
  department: string | null;
  latest_docuseal_url: string | null;
  job_metadata: Record<string, unknown> | null;
  updated_at: string | null;
};

type SignedDocumentRow = {
  id: string;
  application_id: string;
  status: string;
  docuseal_submitter_id: string | null;
  docuseal_submission_url: string | null;
  latest_docuseal_url: string | null;
  pdf_file_path: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
};

const SIGNED_STATUSES = new Set(["SIGNED", "HIRED", "ACCEPTED", "HIRE_CONFIRMED"]);

function extractDocusealSlug(sourceUrl: string | null | undefined) {
  if (!sourceUrl) {
    return null;
  }

  const match = sourceUrl.match(/\/(?:embed\/)?s\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  const { data: job } = await supabase
    .from("job_postings")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!job) redirect("/jobs/manage");

  const { data: rawApplications } = await supabase
    .from("applications")
    .select(`
      id,
      job_posting_id,
      candidate_id,
      status,
      match_score,
      submitted_at,
      cover_letter,
      resume_id,
      profiles!applications_candidate_id_fkey (id, first_name, last_name, email, phone, city, country),
      resumes (id, title, pdf_url, created_at)
    `)
    .eq("job_posting_id", id)
    .order("match_score", { ascending: false, nullsFirst: false })
    .order("submitted_at", { ascending: false });

  const applications = (rawApplications ?? []) as any[];

  const applicationIds = applications.map((a) => a.id);
  const { data: interviews } = applicationIds.length
    ? await supabase
        .from("interviews")
        .select("*")
        .in("application_id", applicationIds)
        .returns<Interview[]>()
    : { data: [] as Interview[] };

  const interviewMap = new Map(
    (interviews || []).map((i) => [i.application_id, i])
  );

  const { data: jobOffers } = applicationIds.length
    ? await supabase
        .from("job_offers")
        .select("id, application_id, status, salary, start_date, work_setup, department, latest_docuseal_url, job_metadata, updated_at")
        .in("application_id", applicationIds)
        .order("created_at", { ascending: false })
    : { data: [] as JobOfferRow[] };

  const { data: signedDocuments } = applicationIds.length
    ? await supabase
        .from("signed_documents")
        .select("id, application_id, status, docuseal_submitter_id, docuseal_submission_url, latest_docuseal_url, pdf_file_path, metadata, updated_at")
        .in("application_id", applicationIds)
        .order("created_at", { ascending: false })
    : { data: [] as SignedDocumentRow[] };

  const signedDocumentMap = Object.fromEntries(
    (signedDocuments ?? []).reduce((accumulator, signedDocument) => {
      if (!accumulator.some((entry) => entry[0] === signedDocument.application_id)) {
        accumulator.push([signedDocument.application_id, signedDocument]);
      }
      return accumulator;
    }, [] as Array<[string, SignedDocumentRow]>)
  ) as Record<string, SignedDocumentRow>;

  const pendingOffers = (jobOffers ?? []).filter((jobOffer) => {
    const status = String(jobOffer.status ?? "").toUpperCase();
    return !SIGNED_STATUSES.has(status);
  });

  const pendingToCheck = [...pendingOffers]
    .sort((left, right) => {
      const leftUpdated = new Date(left.updated_at ?? 0).getTime();
      const rightUpdated = new Date(right.updated_at ?? 0).getTime();
      return rightUpdated - leftUpdated;
    })
    .slice(0, 5);

  const reconciledOffers = await Promise.all(
    (jobOffers ?? []).map(async (jobOffer) => {
      const status = String(jobOffer.status ?? "").toUpperCase();
      if (SIGNED_STATUSES.has(status)) {
        return jobOffer;
      }

      const shouldCheck = pendingToCheck.some((pendingOffer) => pendingOffer.id === jobOffer.id);
      if (!shouldCheck) {
        return jobOffer;
      }

      const sourceUrl =
        (typeof jobOffer.job_metadata?.docuseal_embed_src === "string" && jobOffer.job_metadata.docuseal_embed_src) ||
        (typeof jobOffer.job_metadata?.docuseal_submission_url === "string" && jobOffer.job_metadata.docuseal_submission_url) ||
        jobOffer.latest_docuseal_url ||
        null;

      const slug = extractDocusealSlug(sourceUrl);
      if (!slug) {
        return jobOffer;
      }

      try {
        const apiUrl = process.env.DOCUSEAL_API_URL?.trim() || "https://api.docuseal.com";
        const apiKey = process.env.DOCUSEAL_API_KEY?.trim();
        if (!apiKey) {
          return jobOffer;
        }

        const response = await fetch(`${apiUrl}/submitters?slug=${encodeURIComponent(slug)}`, {
          headers: { "X-Auth-Token": apiKey },
          next: { revalidate: 30 },
        });

        if (!response.ok) {
          return jobOffer;
        }

        const payload = await response.json();
        const submitter = Array.isArray(payload?.data)
          ? payload.data[0]
          : Array.isArray(payload)
            ? payload[0]
            : payload;

        const isCompleted = submitter?.status === "completed" || !!submitter?.completed_at;

        if (!isCompleted) {
          return jobOffer;
        }

        const admin = getAdminClient();
        await Promise.all([
          admin
            .from("job_offers")
            .update({ status: "SIGNED", updated_at: new Date().toISOString() })
            .eq("id", jobOffer.id),
          admin
            .from("applications")
            .update({ status: "hired", updated_at: new Date().toISOString() })
            .eq("id", jobOffer.application_id),
        ]);

        return { ...jobOffer, status: "SIGNED" };
      } catch {
        return jobOffer;
      }
    })
  );

  const jobOfferMap = new Map(
    reconciledOffers.map((jobOffer) => [jobOffer.application_id, jobOffer])
  );
  const jobOfferData = Object.fromEntries(jobOfferMap) as Record<string, JobOfferRow>;

  const updatedApplicationIds = reconciledOffers
    .filter((jobOffer) => SIGNED_STATUSES.has(String(jobOffer.status ?? "").toUpperCase()))
    .map((jobOffer) => jobOffer.application_id);

  const updatedApplications = applications.map((application) =>
    updatedApplicationIds.includes(application.id)
      ? { ...application, status: "hired" as const }
      : application
  );

  return (
    <PageContainer>
      <div className="flex h-[calc(100dvh-7rem)] min-h-0 flex-col">
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={`/jobs/manage/${id}`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary truncate">
              Applicants
            </h1>
            <p className="text-xs text-text-secondary truncate">{job.title}</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary shrink-0 mt-4">
          {applications.length} applicant{applications.length !== 1 ? "s" : ""}
        </p>

        {/* Debug output removed — applicants count displayed above */}

        <div className="mt-4 min-h-0 flex-1 overflow-hidden">
          <ApplicantsHubClient
            jobId={id}
            jobTitle={job.title}
            applications={updatedApplications}
            interviews={interviewMap}
            jobOffers={jobOfferData}
            signedDocuments={signedDocumentMap}
          />
        </div>
      </div>
    </PageContainer>
  );
}