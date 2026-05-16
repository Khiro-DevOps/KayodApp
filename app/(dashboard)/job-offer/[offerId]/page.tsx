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

import PageContainer from "@/components/ui/page-container";
import OfferPageClient from "@/components/job-offer/OfferPageClient";
import JobOfferHeader from "@/components/job-offer/job-offer-header";
import JobOfferTermsPanel from "@/components/job-offer/job-offer-terms-panel";
import JobOfferPdfPanel from "@/components/job-offer/job-offer-pdf-panel";
import ApplicantActionPanel from "@/components/job-offer/applicant-action-panel";
import HRActionPanel from "@/components/job-offer/hr-action-panel";
import DocuSealEmbed from "@/components/job-offer/docuseal-embed";
import { getAdminClient } from "@/lib/supabase/admin";
import { getContractBucketName } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/server";
import type { JobOffer, Profile } from "@/lib/types";

type OfferPageParams = {
  params: Promise<Record<string, string | undefined>>;
};

type Relation<T> = T | T[] | null | undefined;

type ApplicationRow = {
  id: string;
  candidate_id: string;
  job_posting_id: string;
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
  applications?: Relation<ApplicationRow>;
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
  const admin = getAdminClient();

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
    latest_docuseal_url,
    job_id,
    signed_at,
    pdf_file_path,
    metadata,
    created_at,
    updated_at,
    applications!signed_documents_application_id_fkey (
      id,
      candidate_id,
      job_posting_id,
      status,
      updated_at,
      profiles!applications_candidate_id_fkey (
        first_name,
        last_name,
        email
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
      start_date,
      status,
      latest_docuseal_url,
      job_metadata,
      created_at,
      updated_at
    `;

  let jobOfferRow: {
    id: string;
    application_id: string;
    job_id?: string | null;
    start_date?: string | null;
    status: string;
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

  console.log("[JobOfferDebug] jobOfferByApplicationId result:", jobOfferByApplicationId);

  if (jobOfferByApplicationId) {
    jobOfferRow = jobOfferByApplicationId;
  } else {
    const { data: jobOfferById } = await admin
      .from("job_offers")
      .select(jobOfferSelect)
      .eq("id", offerId)
      .maybeSingle();

    console.log("[JobOfferDebug] jobOfferById result:", jobOfferById);

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

      console.log("[JobOfferDebug] latestAnyRes:", latestAnyRes);
      console.log("[JobOfferDebug] latestAnyRes.error:", latestAnyRes?.error);
      if (latestAnyRes?.data) {
        jobOfferRow = latestAnyRes.data;
      }
    }
  }

  if (jobOfferRow) {
    const { data: resolvedApplication } = await admin
      .from("applications")
      .select(`
        id,
        candidate_id,
        job_posting_id,
        status,
        contract_offer_id,
        updated_at,
        profiles!applications_candidate_id_fkey (
          first_name,
          last_name,
          email
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
        applications: undefined,
        contract_templates: undefined,
      } as SignedDocumentRow;
      application = resolvedApplication as ApplicationRow;
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

    console.log("[SignedDocDebug] directOfferById result:", directOfferById);
    console.log("[SignedDocDebug] directOfferById.error:", (directOfferById as any)?.error ?? null);

    if (directOfferById) {
      directOffer = directOfferById as SignedDocumentRow;
    } else {
      const latestDirectRes = await admin
        .from("signed_documents")
        .select(offerSelect)
        .eq("application_id", offerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log("[SignedDocDebug] latestDirectRes:", latestDirectRes);
      console.log("[SignedDocDebug] latestDirectRes.error:", latestDirectRes?.error);
      if (latestDirectRes?.data) {
        directOffer = latestDirectRes.data as SignedDocumentRow;
      }
    }

    if (directOffer) {
      offer = directOffer as SignedDocumentRow;
      application = toSingle(directOffer.applications) as ApplicationRow | null;

      if (!application) {
        const { data: applicationFallback } = await admin
          .from("applications")
          .select(`
            id,
            candidate_id,
            job_posting_id,
            status,
            contract_offer_id,
            updated_at,
            profiles!applications_candidate_id_fkey (
              first_name,
              last_name,
              email
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
          `)
          .eq("id", directOffer.application_id)
          .maybeSingle();

        if (applicationFallback) {
          application = applicationFallback as ApplicationRow;
        }
      }
    }

    if (!offer) {
      // Step 3: Try to find application by offerId (handles old links that use applicationId)
      const { data: applicationRow, error: applicationError } = await admin
        .from("applications")
        .select(`
          id,
          candidate_id,
          job_posting_id,
          status,
          contract_offer_id,
          updated_at,
          profiles!applications_candidate_id_fkey (
            first_name,
            last_name,
            email
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
        `)
        .eq("id", offerId)
        .maybeSingle();

      if (applicationError) {
        console.error("[Job Offer Page] Application lookup failed:", applicationError);
      }

      // If applicationRow found and has contract_offer_id, fetch the old signed_documents offer
      if (!offer && applicationRow?.contract_offer_id) {
        const { data: linkedOffer } = await admin
          .from("signed_documents")
          .select(offerSelect)
          .eq("id", applicationRow.contract_offer_id)
          .maybeSingle();

        if (linkedOffer) {
          offer = linkedOffer as SignedDocumentRow;
          application = toSingle(linkedOffer.applications) as ApplicationRow | null;
          if (!application) {
            application = applicationRow as ApplicationRow;
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
            applications: undefined,
            contract_templates: undefined,
          } as SignedDocumentRow;
          application = applicationRow as ApplicationRow;
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
          offer = latestApplicationSignedDocument as SignedDocumentRow;
          application = toSingle(latestApplicationSignedDocument.applications) as ApplicationRow | null;
          if (!application) {
            application = applicationRow as ApplicationRow;
          }
        }
      }

      if (!offer && applicationRow) {
        application = applicationRow as ApplicationRow;
      }

      // Only show "Offer Document Pending" if there is no resolved offer record.
      // Existing job_offers rows should render even when the signing URL is still empty.
      if (!offer && applicationRow?.status && ["offer_sent", "negotiating"].includes(applicationRow.status)) {
        return (
          <PageContainer>
            <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
              <h2 className="mb-2 text-xl font-bold text-blue-900">Offer Document Pending</h2>
              <p className="text-sm text-blue-800">
                Your offer is being prepared. Once HR finishes generating the signing link, it will appear here automatically.
              </p>
            </div>
          </PageContainer>
        );
      }
    }
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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">Offer not found or you do not have access to this offer.</p>
        </div>
      </PageContainer>
    );
  }

  const isApplicant = application.candidate_id === user.id;
  const isHR = application.job_postings?.created_by === user.id;

  // Debug logging to help diagnose rendering/access issues
  console.log("[JobOfferPage] Debug:", {
    offerIdParam: offerId,
    userId: user.id,
    applicationId: application?.id,
    applicationCandidateId: application?.candidate_id,
    candidateMatchesUser: application?.candidate_id === user.id,
    jobOfferResolvedId: offer?.id,
    offerStatus: offer?.status,
    isApplicant,
    isHR,
  });

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
  const salaryMin = application.job_postings?.salary_min;
  const salaryMax = application.job_postings?.salary_max;
  const currency = application.job_postings?.currency ?? "PHP";
  const metadata = (offer.metadata ?? {}) as Record<string, unknown>;
  if (process.env.NODE_ENV !== "production") {
    console.log("[JobOfferMetadata] metadata keys:", Object.keys(metadata || {}));
  }
  const companyNameOrNull =
    (typeof metadata.company_name === "string" && metadata.company_name.trim()) ||
    (typeof metadata.companyName === "string" && metadata.companyName.trim()) ||
    (typeof metadata.employer_name === "string" && metadata.employer_name.trim()) ||
    (typeof metadata.organization === "string" && metadata.organization.trim()) ||
    application.job_postings?.profiles?.tenants?.name?.trim() ||
    null;
  const hrEmail =
    (typeof metadata.hr_email === "string" && metadata.hr_email.trim()) ||
    (typeof metadata.hrEmail === "string" && metadata.hrEmail.trim()) ||
    null;
  const jobTitle = application.job_postings?.title ?? "Job Offer";
  const workSetup = application.job_postings?.work_setup ?? null;
  const department = application.job_postings?.department_id ?? null;
  const location = application.job_postings?.location ?? null;
  const employmentType = application.job_postings?.employment_type ?? null;
  const startDate =
    (typeof metadata.start_date === "string" && metadata.start_date.trim()) ||
    (typeof metadata.startDate === "string" && metadata.startDate.trim()) ||
    jobOfferRow?.start_date ||
    null;
  const expiresAt = typeof metadata.expires_at === "string" ? metadata.expires_at : typeof metadata.expiresAt === "string" ? metadata.expiresAt : null;
  const signingUrl = offer.docuseal_submission_url ?? (offer as SignedDocumentRow).latest_docuseal_url ?? null;
  const signedPdfUrl = offer.status === "signed" ? await resolveSignedPdfUrl(offer.pdf_file_path) : null;

  return (
    <OfferPageClient
      token={offer.id}
      offer={{ status: offer.status }}
      companyName={companyNameOrNull ?? "Hiring Company"}
      candidateFirstName={candidateFirstName}
      jobTitle={jobTitle}
      location={location}
      employmentType={employmentType}
      workSetup={workSetup}
      department={department}
      startDate={startDate}
      expiresAt={expiresAt}
      salaryMin={salaryMin ?? null}
      salaryMax={salaryMax ?? null}
      currency={currency}
      hrEmail={hrEmail}
      signingUrl={signingUrl}
      signedPdfUrl={signedPdfUrl}
    />
  );

}


