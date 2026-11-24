import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle,
  Clock,
  Download,
  FileText,
} from "lucide-react";
import { redirect } from "next/navigation";

import type { OfferNegotiationRow } from "@/app/actions/offer-negotiation";
import PageContainer from "@/components/ui/page-container";
import HireConfirmationModal from "@/components/hr/HireConfirmationModal";
import OfferPageClient from "@/components/job-offer/OfferPageClient";
import OfferDraftForm from "@/components/job-offer/OfferDraftForm";
import JobOfferHeader from "@/components/job-offer/job-offer-header";
import JobOfferTermsPanel from "@/components/job-offer/job-offer-terms-panel";
import JobOfferPdfPanel from "@/components/job-offer/job-offer-pdf-panel";
import ApplicantActionPanel from "@/components/job-offer/applicant-action-panel";
import HRActionPanel from "@/components/job-offer/hr-action-panel";
import { getDocusealBaseUrl } from "@/lib/docuseal";
import { getOrCreateDocusealEmbedSrc } from "@/lib/docuseal-actions";
import {
  markOfferSigned,
  verifyDocusealSubmissionCompleted,
} from "@/lib/offer-lifecycle";
import { getAdminClient } from "@/lib/supabase/admin";
import { canHr } from "@/lib/rbac/permissions";
import { getContractBucketName } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/server";
import type { JobOffer, Profile } from "@/lib/types";

type OfferPageParams = {
  params: Promise<Record<string, string | undefined>>;
};

type Relation<T> = T | T[] | null | undefined;

type ApplicationRow = {
  id: string;
  applicant_id: string;
  job_id: string;
  status: string;
  updated_at: string;
  contract_offer_id?: string | null;
  profiles?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  job_postings?: {
    created_by?: string | null;
    title?: string | null;
    department_id?: string | null;
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
};

type SignedDocumentRow = {
  id: string;
  application_id: string;
  signing_method: string;
  status: string;
  docuseal_submission_url: string | null;
  latest_docuseal_url?: string | null;
  job_id?: string | null;
  start_date?: string | null;
  signed_at: string | null;
  pdf_file_path: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  job_applications?: Relation<ApplicationRow>;
  contract_templates?: Relation<{
    id: string;
    template_name: string | null;
    docuseal_template_id: string;
  }>;
};

type LegacyJobOfferRow = JobOffer & {
  applications?: Relation<{
    id: string;
    candidate_id: string;
    job_posting_id: string;
    profiles?: Relation<Profile>;
    job_postings?: Relation<{
      created_by?: string | null;
      title?: string | null;
      department_id?: string | null;
      salary_min?: number | null;
      salary_max?: number | null;
      currency?: string | null;
      employment_type?: string | null;
      work_setup?: string | null;
      location?: string | null;
    }>;
  }>;
};

type LegacyJobOfferUi = JobOffer & {
  applications: {
    profiles?: Relation<Profile>;
    job_postings?: Relation<{
      created_by?: string | null;
      title?: string | null;
      department_id?: string | null;
      salary_min?: number | null;
      salary_max?: number | null;
      currency?: string | null;
      employment_type?: string | null;
      work_setup?: string | null;
      location?: string | null;
    }>;
  };
};

function toSingle<T>(value: Relation<T>): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

function displayName(profile: ApplicationRow["profiles"]): string {
  const firstName = profile?.first_name?.trim() ?? "";
  const lastName = profile?.last_name?.trim() ?? "";
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Candidate";
}

function mapJobOfferStatus(status: string) {
  if (status === "SENT" || status === "NEGOTIATION_PENDING") return "sent";
  if (status === "NEGOTIATING") return "negotiating";
  if (status === "ACCEPTED" || status === "HIRED") return "signed";
  if (status === "DECLINED") return "declined";
  if (status === "EXPIRED") return "expired";
  if (status === "PENDING_SIGNATURE") return "pending_signature";
  return "pending";
}

function getStatusMeta(status: string) {
  // Handle both legacy (lowercase) and modern (uppercase) status formats
  const normalizedStatus = status?.toLowerCase?.() || status;

  switch (normalizedStatus) {
    case "signed":
    case "accepted":
    case "hired":
      return {
        label: "Signed & Accepted",
        className: "text-emerald-700 bg-emerald-50 border-emerald-200",
      };
    case "declined":
      return {
        label: "Offer Declined",
        className: "text-red-700 bg-red-50 border-red-200",
      };
    case "expired":
      return {
        label: "Offer Expired",
        className: "text-slate-600 bg-slate-50 border-slate-200",
      };
    case "sent":
    case "negotiation_pending":
    case "pending":
    default:
      return {
        label: "Awaiting Signature",
        className: "text-amber-700 bg-amber-50 border-amber-200",
      };
  }
}

async function resolveSignedPdfUrl(filePath: string | null) {
  if (!filePath) {
    return null;
  }

  try {
    const admin = getAdminClient();
    const { data, error } = await admin.storage
      .from(getContractBucketName())
      .createSignedUrl(filePath, 3600);

    if (error) {
      console.error("[Job Offer Page] Failed to create signed PDF URL:", error.message);
      return null;
    }

    return data?.signedUrl ?? null;
  } catch (error) {
    console.error("[Job Offer Page] Failed to resolve signed PDF URL:", error);
    return null;
  }
}

function extractDocusealSlug(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  const match = url.match(/\/s\/([^/?#]+)/i) ?? url.match(/\/embed\/s\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

export default async function JobOfferPage({ params }: OfferPageParams) {
  const resolvedParams = await params;
  const offerId = resolvedParams.offerId || resolvedParams.offerid;

  if (!offerId) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">Invalid offer ID.</p>
        </div>
      </PageContainer>
    );
  }
  const supabase = await createClient();

  let admin;
  try {
    admin = getAdminClient();
  } catch (err) {
    console.error("[Job Offer Page] Failed to initialize admin Supabase client:", err);
    return (
      <PageContainer>
        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="mb-2 text-xl font-bold text-red-700">Configuration error</h2>
          <p className="text-sm text-red-700">The server is misconfigured for Supabase admin access (invalid or missing service role key).</p>
          <p className="mt-2 text-xs text-text-secondary">Set `SUPABASE_SERVICE_ROLE_KEY` in your environment from your Supabase project settings and restart the dev server. Do not commit this key.</p>
        </div>
      </PageContainer>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const offerSelect = `
    id,
    application_id,
    signing_method,
    status,
    docuseal_submission_url,
    signed_at,
    pdf_file_path,
    metadata,
    created_at,
    updated_at,
    job_applications!signed_documents_application_id_job_applications_fkey (
      id,
      applicant_id,
      job_id,
      status,
      updated_at,
      profiles!job_applications_applicant_id_fkey (
        first_name,
        last_name,
        email
      ),
      job_postings!job_applications_job_id_fkey (
        created_by,
        title,
        department_id,
        salary_min,
        salary_max,
        currency,
        employment_type,
        work_setup,
        location
      )
    ),
    contract_templates (
      id,
      template_name,
      docuseal_template_id
    )
  `;

  let offer: SignedDocumentRow | null = null;
  let application: ApplicationRow | null = null;

  // Step 1: Resolve modern job_offers first so the newest active offer always renders.
  const jobOfferSelect = `
      id,
      application_id,
      job_id,
      salary,
      start_date,
      work_setup,
      work_mode,
      work_location_id,
      department,
      probation_days,
      shift_start,
      shift_end,
      work_days,
      status,
      docuseal_submission_id,
      latest_docuseal_url,
      job_metadata,
      metadata,
      created_at,
      updated_at
    `;

  let jobOfferRow: {
    id: string;
    application_id: string;
    job_id?: string | null;
    salary?: number | null;
    start_date?: string | null;
    work_setup?: string | null;
    work_mode?: string | null;
    work_location_id?: string | null;
    department?: string | null;
    probation_days?: number | null;
    shift_start?: string | null;
    shift_end?: string | null;
    work_days?: string[] | null;
    status: string;
    docuseal_submission_id?: string | null;
    latest_docuseal_url?: string | null;
    job_metadata?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  } | null = null;

  const { data: jobOfferByApplicationId } = await admin
    .from("job_offers")
    .select(jobOfferSelect)
    .eq("application_id", offerId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobOfferByApplicationId) {
    jobOfferRow = jobOfferByApplicationId;
  } else {
    const { data: jobOfferById } = await admin
      .from("job_offers")
      .select(jobOfferSelect)
      .eq("id", offerId)
      .maybeSingle();

    if (jobOfferById) {
      jobOfferRow = jobOfferById;
    } else {
      const latestAnyRes = await admin
        .from("job_offers")
        .select(jobOfferSelect)
        .eq("application_id", offerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestAnyRes?.data) {
        jobOfferRow = latestAnyRes.data;
      }
    }
  }

  if (jobOfferRow) {
    const { data: resolvedApplication } = await admin
      .from("job_applications")
      .select(`
        id,
        applicant_id,
        job_id,
        status,
        contract_offer_id,
        updated_at,
        profiles!job_applications_applicant_id_fkey (
          first_name,
          last_name,
          email
        ),
        job_postings!job_applications_job_id_fkey (
          created_by,
          title,
          department_id,
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
      `)
      .eq("id", jobOfferRow.application_id)
      .maybeSingle();

    if (resolvedApplication) {
      offer = {
        id: jobOfferRow.id,
        application_id: jobOfferRow.application_id,
        signing_method: "docuseal",
        status: mapJobOfferStatus(jobOfferRow.status),
        docuseal_submission_url: jobOfferRow.latest_docuseal_url ?? null,
        signed_at: null,
        pdf_file_path: null,
        metadata: (jobOfferRow.job_metadata ?? jobOfferRow.metadata) as Record<string, unknown> | null,
        created_at: jobOfferRow.created_at,
        updated_at: jobOfferRow.updated_at,
        job_applications: undefined,
        contract_templates: undefined,
      } as SignedDocumentRow;
      application = resolvedApplication as unknown as ApplicationRow;
    }
  }

  if (!offer) {
    // Step 2: Try to find in signed_documents (legacy DocuSeal integration).
    let directOffer: SignedDocumentRow | null = null;

    const { data: directOfferById } = await admin
      .from("signed_documents")
      .select(offerSelect)
      .eq("id", offerId)
      .maybeSingle();

    if (directOfferById) {
      directOffer = directOfferById as unknown as SignedDocumentRow;
    } else {
      const latestDirectRes = await admin
        .from("signed_documents")
        .select(offerSelect)
        .eq("application_id", offerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestDirectRes?.data) {
        directOffer = latestDirectRes.data as unknown as SignedDocumentRow;
      }
    }

    if (directOffer) {
      offer = directOffer as SignedDocumentRow;
      application = toSingle(directOffer.job_applications) as ApplicationRow | null;

      if (!application) {
        const { data: applicationFallback } = await admin
          .from("job_applications")
          .select(`
            id,
            applicant_id,
            job_id,
            status,
            contract_offer_id,
            updated_at,
            profiles!job_applications_applicant_id_fkey (
              first_name,
              last_name,
              email
            ),
            job_postings!job_applications_job_id_fkey (
              created_by,
              title,
              department_id,
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
          `)
          .eq("id", directOffer.application_id)
          .maybeSingle();

        if (applicationFallback) {
          application = applicationFallback as unknown as ApplicationRow;
        }
      }
    }

    if (!offer) {
      // Step 3: Try to find application by offerId (handles old links that use applicationId)
      const { data: applicationRow, error: applicationError } = await admin
        .from("job_applications")
        .select(`
          id,
          applicant_id,
          job_id,
          status,
          contract_offer_id,
          updated_at,
          profiles!job_applications_applicant_id_fkey (
            first_name,
            last_name,
            email
          ),
          job_postings!job_applications_job_id_fkey (
            created_by,
            title,
            department_id,
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
        `)
        .eq("id", offerId)
        .maybeSingle();

      if (applicationError) {
        try {
          console.error(
            "[Job Offer Page] Application lookup failed:",
            applicationError?.message ?? applicationError,
            JSON.parse(JSON.stringify(applicationError, Object.getOwnPropertyNames(applicationError)))
          );
        } catch (e) {
          console.error("[Job Offer Page] Application lookup failed:", applicationError);
        }
      }

      // If applicationRow found and has contract_offer_id, fetch the old signed_documents offer
      if (!offer && applicationRow?.contract_offer_id) {
        const { data: linkedOffer } = await admin
          .from("signed_documents")
          .select(offerSelect)
          .eq("id", applicationRow.contract_offer_id)
          .maybeSingle();

        if (linkedOffer) {
          offer = linkedOffer as unknown as SignedDocumentRow;
          application = toSingle(offer.job_applications) as ApplicationRow | null;
          if (!application) {
            application = applicationRow as unknown as ApplicationRow;
          }
        }
      }

      if (!offer && applicationRow) {
        const { data: latestApplicationJobOffer } = await admin
          .from("job_offers")
          .select(jobOfferSelect)
          .eq("application_id", applicationRow.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestApplicationJobOffer) {
          offer = {
            id: latestApplicationJobOffer.id,
            application_id: latestApplicationJobOffer.application_id,
            signing_method: "docuseal",
            status: mapJobOfferStatus(latestApplicationJobOffer.status),
            docuseal_submission_url: latestApplicationJobOffer.latest_docuseal_url ?? null,
            signed_at: null,
            pdf_file_path: null,
            metadata: latestApplicationJobOffer.job_metadata as Record<string, unknown> | null,
            created_at: latestApplicationJobOffer.created_at,
            updated_at: latestApplicationJobOffer.updated_at,
            job_applications: undefined,
            contract_templates: undefined,
          } as SignedDocumentRow;
          application = applicationRow as unknown as ApplicationRow;
        }
      }

      if (!offer && applicationRow) {
        const { data: latestApplicationSignedDocument } = await admin
          .from("signed_documents")
          .select(offerSelect)
          .eq("application_id", applicationRow.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestApplicationSignedDocument) {
          offer = latestApplicationSignedDocument as unknown as SignedDocumentRow;
          application = toSingle(offer.job_applications) as ApplicationRow | null;
          if (!application) {
            application = applicationRow as unknown as ApplicationRow;
          }
        }
      }

      if (!offer && applicationRow) {
        application = applicationRow as unknown as ApplicationRow;
      }
    }
  }

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role, hr_role, is_tenant_owner, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const isViewerHRRole = Boolean(
    viewerProfile?.role && ["hr_manager", "admin", "hr"].includes(viewerProfile.role)
  );
  const canApproveNegotiations = isViewerHRRole
    ? canHr(viewerProfile?.hr_role, "offers:approve_and_send", viewerProfile?.is_tenant_owner)
    : false;

  // When an application is resolved and either has no offer yet or its active job_offers row is DRAFT,
  // render the HR offer draft creator / editor.
  if (application && (!offer || (jobOfferRow && jobOfferRow.status?.toUpperCase() === "DRAFT"))) {
    const canManageDraft =
      application.job_postings?.created_by === user.id || isViewerHRRole;

    if (!canManageDraft) {
      return (
        <PageContainer>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-700">You do not have access to this offer.</p>
          </div>
        </PageContainer>
      );
    }

    let tenantId = viewerProfile?.tenant_id ?? null;
    if (!tenantId && application.job_postings?.created_by) {
      const { data: creatorProfile } = await admin
        .from("profiles")
        .select("tenant_id")
        .eq("id", application.job_postings.created_by)
        .maybeSingle();
      tenantId = creatorProfile?.tenant_id ?? null;
    }

    const { data: branchRows } = tenantId
      ? await admin
        .from("office_branches")
        .select("id, name, address")
        .eq("tenant_id", tenantId)
        .order("name")
      : { data: null };

    return (
      <PageContainer>
        <OfferDraftForm
          applicationId={application.id}
          jobId={jobOfferRow?.job_id ?? application.job_id}
          candidateName={displayName(application.profiles)}
          jobTitle={application.job_postings?.title ?? "Job Offer"}
          initialOffer={jobOfferRow && jobOfferRow.status?.toUpperCase() === "DRAFT" ? jobOfferRow : null}
          branches={branchRows ?? []}
        />
      </PageContainer>
    );
  }

  if (!offer || !application) {
    const legacyOfferSelect = `
        id,
        application_id,
        applicant_id,
        hr_id,
        template_id,
        submission_id,
        signed_pdf_url,
        status,
        version,
        terms,
        expires_at,
        issued_at,
        viewed_at,
        accepted_at,
        negotiation_round,
        created_at,
        updated_at,
        applications (
          id,
          candidate_id,
          job_posting_id,
          profiles!applications_candidate_id_fkey (
            id,
            first_name,
            last_name,
            email,
            role
          ),
          job_postings (
            created_by,
            title,
            department_id,
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
      `;

    let legacyOffer: LegacyJobOfferRow | null = null;

    const { data: legacyOfferById } = await admin
      .from("job_offer_applications")
      .select(legacyOfferSelect)
      .eq("id", offerId)
      .maybeSingle();

    if (legacyOfferById) {
      legacyOffer = legacyOfferById as unknown as LegacyJobOfferRow;
    } else {
      const { data: latestLegacyOfferByApplication } = await admin
        .from("job_offer_applications")
        .select(legacyOfferSelect)
        .eq("application_id", offerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestLegacyOfferByApplication) {
        legacyOffer = latestLegacyOfferByApplication as unknown as LegacyJobOfferRow;
      }
    }

    if (legacyOffer) {
      const typedLegacyOffer = legacyOffer as LegacyJobOfferRow;
      const legacyApplication = toSingle(typedLegacyOffer.applications);
      const legacyApplicant = toSingle(legacyApplication?.profiles) ?? null;
      const legacyJobPosting = toSingle(legacyApplication?.job_postings);
      const legacyIsApplicant = typedLegacyOffer.applicant_id === user.id;
      const legacyIsHR = typedLegacyOffer.hr_id === user.id;
      const legacyOfferForUi = {
        ...typedLegacyOffer,
        applications: legacyApplication ?? {
          profiles: legacyApplicant,
          job_postings: legacyJobPosting,
        },
      } as LegacyJobOfferUi;

      if (!legacyIsApplicant && !legacyIsHR) {
        return (
          <PageContainer>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm text-red-700">You do not have access to this offer.</p>
            </div>
          </PageContainer>
        );
      }

      return (
        <PageContainer>
          <div className="space-y-6">
            {typedLegacyOffer.status === "expired" && (
              <div className="rounded-2xl border-l-4 border-l-gray-500 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-700">⏰ This offer has expired.</p>
              </div>
            )}

            <JobOfferHeader offer={legacyOfferForUi} applicant={legacyApplicant} isHR={legacyIsHR} />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <JobOfferTermsPanel terms={legacyOfferForUi.terms} isExpired={legacyOfferForUi.status === "expired"} />
                <JobOfferPdfPanel offer={legacyOfferForUi} />
              </div>

              <div>{legacyIsApplicant ? <ApplicantActionPanel offer={legacyOfferForUi} /> : <HRActionPanel offer={legacyOfferForUi} />}</div>
            </div>
          </div>
        </PageContainer>
      );
    }

    return (
      <PageContainer>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center space-y-4">
          <p className="text-sm text-text-main">No offer yet for this candidate</p>
        </div>
      </PageContainer>
    );
  }

  const isApplicant = application.applicant_id === user.id;
  const isHR = application.job_postings?.created_by === user.id || isViewerHRRole;

  if (!isApplicant && !isHR) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">You do not have access to this offer.</p>
        </div>
      </PageContainer>
    );
  }

  const candidateFirstName = displayName(application.profiles).split(" ")[0] || "Candidate";
  const candidateEmail = application.profiles?.email?.trim() ?? "";
  const salaryMin = jobOfferRow?.salary ?? application.job_postings?.salary_min;
  const salaryMax = jobOfferRow?.salary ?? application.job_postings?.salary_max;
  const currency = application.job_postings?.currency ?? "PHP";
  const metadata = (offer.metadata ?? {}) as Record<string, unknown>;
  if (process.env.NODE_ENV !== "production") {
    console.log("[JobOfferMetadata] metadata keys:", Object.keys(metadata || {}));
  }
  const embedSrc = typeof metadata.docuseal_embed_src === "string" && metadata.docuseal_embed_src.trim()
    ? metadata.docuseal_embed_src.trim()
    : null;
  const companyNameOrNull =
    application.job_postings?.profiles?.tenants?.name?.trim() ||
    (typeof metadata.company_name === "string" && metadata.company_name.trim()) ||
    (typeof metadata.companyName === "string" && metadata.companyName.trim()) ||
    (typeof metadata.employer_name === "string" && metadata.employer_name.trim()) ||
    (typeof metadata.organization === "string" && metadata.organization.trim()) ||
    null;
  const hrEmail =
    (typeof metadata.hr_email === "string" && metadata.hr_email.trim()) ||
    (typeof metadata.hrEmail === "string" && metadata.hrEmail.trim()) ||
    null;
  const jobTitle = application.job_postings?.title ?? "Job Offer";
  const workSetup = jobOfferRow?.work_setup ?? jobOfferRow?.work_mode ?? application.job_postings?.work_setup ?? null;
  const department = jobOfferRow?.department ?? application.job_postings?.department_id ?? null;
  const { data: jobPostingMeta } = application.job_id
    ? await admin
        .from("job_postings")
        .select("tenant_id, work_location_id, offer_letter_settings")
        .eq("id", application.job_id)
        .maybeSingle<{
          tenant_id?: string | null;
          work_location_id?: string | null;
          offer_letter_settings?: Record<string, unknown> | null;
        }>()
    : { data: null };

  const jobOfferSettings = (jobPostingMeta?.offer_letter_settings ?? null) as Record<
    string,
    unknown
  > | null;

  const rawPostingLocation = application.job_postings?.location?.trim() ?? "";
  const isUuidLocation = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    rawPostingLocation
  );
  const branchIdToResolve =
    jobOfferRow?.work_location_id ??
    jobPostingMeta?.work_location_id ??
    (typeof jobOfferSettings?.work_location_id === "string"
      ? jobOfferSettings.work_location_id
      : null) ??
    (isUuidLocation ? rawPostingLocation : null);
  let location: string | null =
    rawPostingLocation && !isUuidLocation ? rawPostingLocation : null;
  if (branchIdToResolve) {
    const { data: branchRow } = await admin
      .from("office_branches")
      .select("name, address")
      .eq("id", branchIdToResolve)
      .maybeSingle<{ name: string; address?: string | null }>();
    if (branchRow) {
      location = branchRow.address
        ? `${branchRow.name} — ${branchRow.address}`
        : branchRow.name;
    }
  }
  if (!location) {
    const setupNorm = String(workSetup ?? "").trim().toLowerCase();
    if (setupNorm === "remote" || setupNorm === "wfh") {
      location = "Remote";
    } else if (jobPostingMeta?.tenant_id) {
      const { data: primaryBranch } = await admin
        .from("office_branches")
        .select("name, address")
        .eq("tenant_id", jobPostingMeta.tenant_id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle<{ name: string; address?: string | null }>();
      if (primaryBranch) {
        location = primaryBranch.address
          ? `${primaryBranch.name} — ${primaryBranch.address}`
          : primaryBranch.name;
      }
    }
  }

  const silDays =
    Number(
      metadata.service_incentive_leave ??
        metadata.phServiceIncentiveLeave ??
        jobOfferSettings?.service_incentive_leave ??
        jobOfferSettings?.phServiceIncentiveLeave ??
        5
    ) || 5;
  const vlDays =
    Number(
      metadata.vacation_leave_days ??
        metadata.phVacationLeaveDays ??
        jobOfferSettings?.vacation_leave_days ??
        jobOfferSettings?.phVacationLeaveDays ??
        0
    ) || 0;
  const slDays =
    Number(
      metadata.sick_leave_days ??
        metadata.phSickLeaveDays ??
        jobOfferSettings?.sick_leave_days ??
        jobOfferSettings?.phSickLeaveDays ??
        0
    ) || 0;
  const leaveCreditParts = [
    `${silDays} SIL`,
    ...(vlDays > 0 ? [`${vlDays} VL`] : []),
    ...(slDays > 0 ? [`${slDays} SL`] : []),
  ];
  const leaveCreditsSummary = `${leaveCreditParts.join(" · ")} / year`;

  const rawCompPkg = (metadata.compensation_package ??
    jobOfferSettings?.compensation_package ??
    null) as { hmo_coverage?: { enabled?: boolean; timing?: string } } | null;
  const hmoProviderText =
    (typeof metadata.hmo_provider === "string" && metadata.hmo_provider.trim()) ||
    (typeof metadata.phHmoProvider === "string" && metadata.phHmoProvider.trim()) ||
    (typeof jobOfferSettings?.hmo_provider === "string" &&
      jobOfferSettings.hmo_provider.trim()) ||
    (typeof jobOfferSettings?.phHmoProvider === "string" &&
      jobOfferSettings.phHmoProvider.trim()) ||
    null;
  const hmoCoverageSummary =
    hmoProviderText ||
    (rawCompPkg?.hmo_coverage?.enabled
      ? rawCompPkg.hmo_coverage.timing === "day_1"
        ? "Company HMO (Effective Day 1)"
        : "Company HMO (Upon Regularization)"
      : "Per Company Policy");
  const employmentType = application.job_postings?.employment_type ?? null;
  const startDate =
    jobOfferRow?.start_date ||
    (typeof metadata.start_date === "string" && metadata.start_date.trim()) ||
    (typeof metadata.startDate === "string" && metadata.startDate.trim()) ||
    null;
  const expiresAt = typeof metadata.expires_at === "string" ? metadata.expires_at : typeof metadata.expiresAt === "string" ? metadata.expiresAt : null;
  const signingUrl = offer.docuseal_submission_url ?? (offer as SignedDocumentRow).latest_docuseal_url ?? null;
  let isAlreadySigned = ["signed", "accepted", "hired"].includes(offer.status.toLowerCase());
  let completedSignedDocument: SignedDocumentRow | null = null;
  let resolvedEmbedSrc = embedSrc;
  let docusealEmbedError: string | null = null;

  const needsEmbedSrc =
    !!jobOfferRow &&
    !!jobOfferRow.latest_docuseal_url &&
    !resolvedEmbedSrc &&
    !["signed", "declined", "expired", "hired", "accepted"].includes(jobOfferRow.status?.toLowerCase?.() ?? "");

  if (needsEmbedSrc && jobOfferRow) {
    const activeJobOfferRow = jobOfferRow;
    try {
      resolvedEmbedSrc = await getOrCreateDocusealEmbedSrc(activeJobOfferRow.id);
    } catch (error) {
      docusealEmbedError = error instanceof Error ? error.message : "Unable to load signing form. Please try refreshing the page.";
      console.error("[Job Offer Page] Failed to resolve DocuSeal embed source", {
        jobOfferId: activeJobOfferRow.id,
        error,
      });
    }
  }

  const docusealStatus = typeof jobOfferRow?.job_metadata?.docuseal_status === "string"
    ? jobOfferRow.job_metadata.docuseal_status
    : null;

  if (docusealStatus && ["completed", "signed"].includes(docusealStatus.toLowerCase())) {
    isAlreadySigned = true;
  }

  if (!isAlreadySigned && jobOfferRow?.docuseal_submission_id) {
    try {
      const subCompleted = await verifyDocusealSubmissionCompleted(jobOfferRow.docuseal_submission_id);
      if (subCompleted) {
        isAlreadySigned = true;
        if (jobOfferRow.application_id) {
          await markOfferSigned({
            applicationId: jobOfferRow.application_id,
            offerId: jobOfferRow.id,
            source: "offer_page_reconcile",
          });
        }
      }
    } catch (error) {
      console.error("[JobOfferPage] DocuSeal submission reconciliation failed:", error);
    }
  }

  if (!isAlreadySigned && signingUrl) {
    try {
      const docusealApiUrl = getDocusealBaseUrl();
      const slug = extractDocusealSlug(signingUrl);

      if (slug) {
        const dsRes = await fetch(`${docusealApiUrl}/submitters?slug=${encodeURIComponent(slug)}`, {
          headers: {
            "X-Auth-Token": process.env.DOCUSEAL_API_KEY?.trim() ?? "",
          },
          cache: "no-store",
        });

        if (dsRes.ok) {
          const dsData = await dsRes.json();
          const submitter = Array.isArray(dsData)
            ? dsData[0]
            : Array.isArray(dsData?.data)
              ? dsData.data[0]
              : dsData;

          if (submitter?.status === "completed" || submitter?.completed_at) {
            isAlreadySigned = true;

            if (jobOfferRow?.application_id) {
              await markOfferSigned({
                applicationId: jobOfferRow.application_id,
                offerId: jobOfferRow.id,
                source: "offer_page_reconcile",
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("[JobOfferPage] DocuSeal status reconciliation failed:", error);
    }
  }

  if (isAlreadySigned) {
    if (application && application.status !== "hired") {
      application.status = "pre_employment";
    }
    if (jobOfferRow && String(jobOfferRow.status ?? "").toUpperCase() !== "HIRED") {
      jobOfferRow.status = "SIGNED";
    }
  }

  if (application?.contract_offer_id) {
    const { data: linkedSignedDocument } = await admin
      .from("signed_documents")
      .select("id, application_id, status, docuseal_submission_url, signed_at, pdf_file_path, metadata, created_at, updated_at")
      .eq("id", application.contract_offer_id)
      .maybeSingle();

    if (linkedSignedDocument) {
      completedSignedDocument = linkedSignedDocument as SignedDocumentRow;
    }
  }

  if (!completedSignedDocument) {
    const { data: latestSignedDocument } = await admin
      .from("signed_documents")
      .select("id, application_id, status, docuseal_submission_url, signed_at, pdf_file_path, metadata, created_at, updated_at")
      .eq("application_id", application.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSignedDocument) {
      completedSignedDocument = latestSignedDocument as SignedDocumentRow;
    }
  }

  const signedDocumentStatus = completedSignedDocument?.status?.toLowerCase?.() ?? "";
  const isCompletedSigning = isAlreadySigned || ["signed", "accepted", "hired"].includes(signedDocumentStatus) || Boolean(completedSignedDocument?.signed_at) || Boolean(completedSignedDocument?.pdf_file_path) || Boolean(offer.signed_at) || Boolean(offer.pdf_file_path);
  const signedPdfUrl = isCompletedSigning ? await resolveSignedPdfUrl(completedSignedDocument?.pdf_file_path ?? offer.pdf_file_path) : null;

  const { data: negotiationRows } = await admin
    .from("job_offer_negotiations")
    .select(
      "id, offer_id, application_id, initiator_id, round, target_field, current_value, requested_value, comments, status, counter_value, hr_comment, resolved_by, created_at, resolved_at"
    )
    .eq("application_id", application.id)
    .order("round", { ascending: true })
    .order("created_at", { ascending: true });

  const showConfirmHire =
    isHR &&
    !isApplicant &&
    (isAlreadySigned ||
      isCompletedSigning ||
      String(jobOfferRow?.status ?? "").toUpperCase() === "SIGNED" ||
      application.status === "pre_employment" ||
      application.status === "hired");

  let hiredEmployeeId: string | null = null;
  if (isHR && !isApplicant && application.status === "hired" && application.applicant_id) {
    const { data: empRow } = await admin
      .from("employees")
      .select("id")
      .eq("profile_id", application.applicant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    hiredEmployeeId = empRow?.id ?? null;
  }

  const candidateFullName = displayName(application.profiles);
  const isHrOnlyView = isHR && !isApplicant;

  const clientNode = (
    <OfferPageClient
      token={offer.id}
      applicationId={application.id}
      jobId={application.job_id}
      employeeId={hiredEmployeeId}
      offer={{ status: isCompletedSigning ? "signed" : offer.status }}
      isAlreadySigned={isAlreadySigned || isCompletedSigning}
      applicationStatus={application.status}
      companyName={companyNameOrNull ?? "Company"}
      candidateFirstName={candidateFirstName}
      candidateFullName={candidateFullName}
      candidateEmail={candidateEmail}
      jobTitle={jobTitle}
      location={location}
      employmentType={employmentType}
      workSetup={workSetup}
      department={department}
      startDate={startDate}
      expiresAt={expiresAt}
      signedAt={completedSignedDocument?.signed_at ?? offer.signed_at ?? null}
      signingMethod={offer.signing_method}
      salaryMin={salaryMin ?? null}
      salaryMax={salaryMax ?? null}
      currency={currency}
      hrEmail={hrEmail}
      signingUrl={signingUrl}
      embedSrc={resolvedEmbedSrc}
      docusealEmbedError={docusealEmbedError}
      signedPdfUrl={signedPdfUrl}
      negotiations={(negotiationRows ?? []) as OfferNegotiationRow[]}
      isHR={isHrOnlyView}
      canApproveNegotiations={canApproveNegotiations}
      scheduleType={typeof metadata.schedule_type === "string" ? metadata.schedule_type : null}
      workDaysPerWeek={
        typeof metadata.work_days_per_week === "number" ? metadata.work_days_per_week : null
      }
      restDaysPolicy={
        typeof metadata.rest_days_policy === "string" ? metadata.rest_days_policy : null
      }
      shiftRotationPattern={
        typeof metadata.shift_rotation_pattern === "string"
          ? metadata.shift_rotation_pattern
          : null
      }
      shiftStart={
        (typeof metadata.shift_start === "string" ? metadata.shift_start : null) ??
        (typeof (jobOfferRow as { shift_start?: string | null } | null)?.shift_start === "string"
          ? (jobOfferRow as { shift_start?: string | null }).shift_start
          : null)
      }
      shiftEnd={
        (typeof metadata.shift_end === "string" ? metadata.shift_end : null) ??
        (typeof (jobOfferRow as { shift_end?: string | null } | null)?.shift_end === "string"
          ? (jobOfferRow as { shift_end?: string | null }).shift_end
          : null)
      }
      workDays={
        Array.isArray(metadata.work_days)
          ? (metadata.work_days as string[])
          : Array.isArray((jobOfferRow as { work_days?: string[] | null } | null)?.work_days)
            ? ((jobOfferRow as { work_days?: string[] | null }).work_days as string[])
            : null
      }
      workScheduleSummary={
        typeof metadata.work_schedule_summary === "string"
          ? metadata.work_schedule_summary
          : null
      }
      reportsTo={
        (typeof metadata.reports_to_label === "string" && metadata.reports_to_label.trim()) ||
        (typeof metadata.reports_to === "string" && metadata.reports_to.trim()) ||
        null
      }
      leaveCreditsSummary={leaveCreditsSummary}
      hmoCoverageSummary={hmoCoverageSummary}
      hrHeaderAction={
        showConfirmHire ? (
          <HireConfirmationModal
            applicationId={application.id}
            candidateName={candidateFullName}
            jobTitle={jobTitle}
            isConfirmed={
              application.status === "hired" ||
              String(jobOfferRow?.status ?? "").toUpperCase() === "HIRED"
            }
          />
        ) : null
      }
    />
  );

  if (isHrOnlyView) {
    return <PageContainer>{clientNode}</PageContainer>;
  }

  return clientNode;

}


