import PageContainer from "@/components/ui/page-container";
import ApplicantContractCard from "@/components/hr/ApplicantContractCard";
import HireConfirmationModal from "@/components/hr/HireConfirmationModal";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { redirect, notFound } from "next/navigation";

type OfferRow = {
  id: string;
  application_id: string;
  status: string;
  updated_at: string;
  salary: number | null;
  start_date: string | null;
  work_setup: string | null;
  department: string | null;
  probation_days: number | null;
  job_metadata: Record<string, unknown> | null;
  latest_docuseal_url: string | null;
  applications: {
    id: string;
    candidate_id: string;
    status: string;
    submitted_at: string;
    updated_at: string;
    contract_offer_id?: string | null;
    profiles?: {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    } | null;
    job_postings?: {
      id?: string;
      title?: string | null;
      created_by?: string | null;
      salary_min?: number | null;
      salary_max?: number | null;
      currency?: string | null;
      employment_type?: string | null;
      work_setup?: string | null;
      location?: string | null;
      profiles?: {
        tenants?: {
          name?: string | null;
        } | null;
      } | null;
    } | null;
  } | null;
};

type SignedDocumentRow = {
  id: string;
  application_id: string;
  status: string;
  docuseal_submission_url: string | null;
  latest_docuseal_url: string | null;
  pdf_file_path: string | null;
  metadata: Record<string, unknown> | null;
};

type DocusealPayload =
  | {
      documents?: Array<{ url?: string | null }>;
      data?: Array<{ documents?: Array<{ url?: string | null }> }>;
    }
  | Array<{
      documents?: Array<{ url?: string | null }>;
    }>;

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function extractDocusealSlug(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/\/(?:embed\/)?s\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function readDocuments(payload: DocusealPayload) {
  if (Array.isArray(payload)) {
    return payload[0]?.documents ?? [];
  }

  if (Array.isArray(payload.data)) {
    return payload.data[0]?.documents ?? [];
  }

  return payload.documents ?? [];
}

function formatName(profile: OfferRow["applications"] extends { profiles?: infer T } ? T : never) {
  const firstName = profile?.first_name?.trim() ?? "";
  const lastName = profile?.last_name?.trim() ?? "";
  return [firstName, lastName].filter(Boolean).join(" ").trim() || profile?.email || "Unknown Applicant";
}

async function resolveSignedPdfUrl(source: {
  metadata?: Record<string, unknown> | null;
  docuseal_submission_url?: string | null;
  latest_docuseal_url?: string | null;
}) {
  const apiUrl = process.env.DOCUSEAL_API_URL?.trim() || "https://api.docuseal.com";
  const apiKey = process.env.DOCUSEAL_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const sourceUrl =
    source.docuseal_submission_url ||
    source.latest_docuseal_url ||
    (typeof source.metadata?.docuseal_submission_url === "string" && source.metadata.docuseal_submission_url) ||
    (typeof source.metadata?.docuseal_embed_src === "string" && source.metadata.docuseal_embed_src) ||
    null;

  const slug = extractDocusealSlug(sourceUrl);
  if (!slug) {
    return null;
  }

  const response = await fetch(`${apiUrl}/submitters?slug=${encodeURIComponent(slug)}`, {
    headers: {
      "X-Auth-Token": apiKey,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as DocusealPayload;
  const documents = readDocuments(payload);
  return documents[0]?.url ?? null;
}

export default async function SignedDocumentReviewPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;

  if (!applicationId) {
    notFound();
  }

  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const authRole = (user.user_metadata?.role ?? user.raw_user_meta_data?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);

  const { data: offer } = await admin
    .from("job_offers")
    .select(`
      id,
      application_id,
      status,
      updated_at,
      salary,
      start_date,
      work_setup,
      department,
      probation_days,
      job_metadata,
      latest_docuseal_url,
      applications!inner (
        id,
        candidate_id,
        status,
        submitted_at,
        updated_at,
        contract_offer_id,
        profiles!applications_candidate_id_fkey (
          first_name,
          last_name,
          email,
          avatar_url
        ),
        job_postings!inner (
          id,
          title,
          created_by,
          salary_min,
          salary_max,
          currency,
          employment_type,
          work_setup,
          location,
          profiles!job_postings_created_by_fkey (
            tenants (
              name
            )
          )
        )
      )
    `)
    .eq("application_id", applicationId)
    .maybeSingle<OfferRow>();

  if (!offer?.applications) {
    notFound();
  }

  const application = offer.applications;
  const jobPosting = toSingle(application.job_postings);
  const candidate = toSingle(application.profiles);

  if (!jobPosting?.created_by || jobPosting.created_by !== user.id) {
    if (!isHRRole(role)) {
      redirect("/dashboard");
    }
    redirect("/dashboard");
  }

  const candidateName = formatName(candidate);
  const isConfirmed = normalizeStatus(application.status) === "hire_confirmed" || normalizeStatus(offer.status) === "hired";
  const signedDocumentQuery = application.contract_offer_id
    ? await admin
        .from("signed_documents")
        .select("id, application_id, status, docuseal_submission_url, latest_docuseal_url, pdf_file_path, metadata")
        .eq("id", application.contract_offer_id)
        .maybeSingle<SignedDocumentRow>()
    : await admin
        .from("signed_documents")
        .select("id, application_id, status, docuseal_submission_url, latest_docuseal_url, pdf_file_path, metadata")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SignedDocumentRow>();

  const signedDocument = signedDocumentQuery.data ?? null;
  const signedPdfUrl = await resolveSignedPdfUrl({
    metadata: signedDocument?.metadata ?? offer.job_metadata,
    docuseal_submission_url: signedDocument?.docuseal_submission_url ?? null,
    latest_docuseal_url: signedDocument?.latest_docuseal_url ?? offer.latest_docuseal_url,
  });

  const startDate = offer.start_date ?? (typeof offer.job_metadata?.start_date === "string" ? offer.job_metadata.start_date : null);
  const workSetup = offer.work_setup ?? (typeof offer.job_metadata?.work_setup === "string" ? offer.job_metadata.work_setup : null) ?? jobPosting?.work_setup ?? null;
  const salaryAmount = offer.salary ?? jobPosting?.salary_min ?? jobPosting?.salary_max ?? null;
  const salaryCurrency = typeof offer.job_metadata?.salary_currency === "string"
    ? offer.job_metadata.salary_currency
    : jobPosting?.currency ?? "PHP";
  const companyName =
    (typeof offer.job_metadata?.company_name === "string" && offer.job_metadata.company_name) ||
    jobPosting?.profiles?.tenants?.name ||
    null;

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Contract review
          </h1>
          <p className="text-sm text-text-secondary">
            Review the signed document before confirming the hire.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">Signed document</p>
                <p className="text-xs text-text-secondary">{jobPosting?.title ?? "Untitled position"}</p>
              </div>
              {signedPdfUrl ? (
                <a
                  href={signedPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-text-primary hover:bg-gray-50"
                >
                  Download PDF
                </a>
              ) : (
                <span className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-text-secondary">
                  PDF unavailable
                </span>
              )}
            </div>

            <div className="min-h-[520px] overflow-hidden rounded-2xl border border-border bg-white">
              {signedPdfUrl ? (
                <iframe
                  src={signedPdfUrl}
                  title="Signed offer letter"
                  className="h-[520px] w-full"
                />
              ) : (
                <div className="flex h-[520px] items-center justify-center px-6 text-center">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Signed PDF not available yet</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      DocuSeal did not return a downloadable PDF for this submission.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <ApplicantContractCard
              candidateName={candidateName}
              candidateEmail={candidate?.email ?? ""}
              jobTitle={jobPosting?.title ?? "Untitled position"}
              avatarUrl={candidate?.avatar_url ?? null}
              badge={
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${isConfirmed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                  {isConfirmed ? "Hired & confirmed" : "Awaiting confirmation"}
                </span>
              }
            />

            <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">Offer summary</p>
                <p className="text-xs text-text-secondary">Key terms from the offer metadata</p>
              </div>

              <div className="space-y-2 text-sm text-text-secondary">
                <div className="flex items-center justify-between gap-3">
                  <span>Salary</span>
                  <span className="font-medium text-text-primary">
                    {salaryAmount !== null ? `${salaryCurrency} ${salaryAmount.toLocaleString("en-PH")}` : "Not set"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Start date</span>
                  <span className="font-medium text-text-primary">{startDate ?? "Not set"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Work setup</span>
                  <span className="font-medium text-text-primary">{workSetup ?? "Not set"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Company</span>
                  <span className="font-medium text-text-primary">{companyName ?? "Not set"}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">Timeline</p>
                <p className="text-xs text-text-secondary">Submission and confirmation dates</p>
              </div>

              <div className="space-y-2 text-sm text-text-secondary">
                <div className="flex items-center justify-between gap-3">
                  <span>Submitted</span>
                  <span className="font-medium text-text-primary">
                    {new Date(application.submitted_at).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Signed</span>
                  <span className="font-medium text-text-primary">
                    {new Date(offer.updated_at).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">Action</p>
                <p className="text-xs text-text-secondary">Confirm this hire once the document is correct.</p>
              </div>

              <HireConfirmationModal
                applicationId={application.id}
                candidateName={candidateName}
                jobTitle={jobPosting.title ?? "Untitled position"}
                isConfirmed={isConfirmed}
              />
            </div>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}