import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDocusealEmbedSrc } from "@/lib/docuseal-actions";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { effectiveRole, isHRRole } from "@/lib/roles";
import type { OfferNegotiationRow } from "@/app/actions/offer-negotiation";
import type { Profile, Application } from "@/lib/types";
import ApplicationDetailView from "@/app/(dashboard)/applicants/[id]/documents/application-detail-view";

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function deriveNamesFromUser(user: {
  email?: string | null;
  user_metadata?: unknown;
  raw_user_meta_data?: unknown;
}): { firstName: string; lastName: string } {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawMetadata = (user.raw_user_meta_data ?? {}) as Record<string, unknown>;

  const firstName = normalizeName(metadata.first_name ?? rawMetadata.first_name);
  const lastName = normalizeName(metadata.last_name ?? rawMetadata.last_name);
  if (firstName || lastName) {
    return { firstName, lastName };
  }

  const fullName = normalizeName(metadata.full_name ?? rawMetadata.full_name ?? metadata.name ?? rawMetadata.name);
  if (fullName) {
    const [first, ...rest] = fullName.split(/\s+/);
    return {
      firstName: first ?? "",
      lastName: rest.join(" "),
    };
  }

  const handleFallback = normalizeName((user.email ?? "").split("@")[0]).replace(/[._-]+/g, " ").trim();
  return {
    firstName: handleFallback || "User",
    lastName: "",
  };
}

function isActiveSignedDocumentStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ["sent", "pending", "negotiating"].includes(String(status).toLowerCase());
}

function isActiveJobOfferStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ["draft", "sent", "negotiating", "pending_review", "pending", "negotiation_pending"].includes(
    String(status).toLowerCase()
  );
}

export default async function ApplicantApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);

  // Fetch application with all related data
  const { data: rawApplication } = await supabase
    .from("job_applications")
    .select(`
      id,
      job_id,
      contract_offer_id,
      applicant_id,
      resume_id,
      status,
      cover_letter,
      match_score,
      hr_notes,
      created_at,
      updated_at,
      profiles!job_applications_applicant_id_fkey ( id, first_name, last_name, email, phone, avatar_url, city, country ),
      resumes ( id, title, pdf_url, content_text ),
      job_postings!job_applications_job_id_fkey (
        id,
        title,
        location,
        work_setup,
        description,
        salary_min,
        salary_max,
        currency,
        employment_type,
        tenants ( name ),
        profiles!job_postings_created_by_fkey (
          company_name,
          tenants ( name )
        )
      )
    `)
    .eq("id", id)
    .single();

  if (!rawApplication) {
    redirect("/applicant/applications");
  }

  const application = {
    ...rawApplication,
    candidate_id: rawApplication.applicant_id,
    job_posting_id: rawApplication.job_id,
    submitted_at: rawApplication.created_at,
    profiles: Array.isArray(rawApplication.profiles) ? rawApplication.profiles[0] : rawApplication.profiles,
    resumes: Array.isArray(rawApplication.resumes) ? rawApplication.resumes[0] : rawApplication.resumes,
    job_postings: Array.isArray(rawApplication.job_postings) ? rawApplication.job_postings[0] : rawApplication.job_postings,
  } as unknown as Application;

  // Access control: Candidates can only view their own applications
  if (rawApplication.applicant_id !== user.id && !isHR) {
    redirect("/applicant/applications");
  }

  // Repair candidate profile names from auth metadata when stale/missing.
  try {
    const admin = getAdminClient();
    const candidateId = rawApplication.applicant_id;
    const candidateProfile = (application.profiles ?? {}) as {
      first_name?: string | null;
      last_name?: string | null;
    };

    const { data: authData } = await admin.auth.admin.getUserById(candidateId);
    const authUser = authData?.user;

    if (authUser) {
      const { firstName, lastName } = deriveNamesFromUser(authUser);
      const currentFirst = normalizeName(candidateProfile.first_name);
      const currentLast = normalizeName(candidateProfile.last_name);

      if ((firstName || lastName) && (currentFirst !== firstName || currentLast !== lastName)) {
        await admin
          .from("profiles")
          .update({ first_name: firstName, last_name: lastName })
          .eq("id", candidateId);

        (application.profiles as { first_name?: string; last_name?: string }).first_name = firstName;
        (application.profiles as { first_name?: string; last_name?: string }).last_name = lastName;
      }
    }
  } catch {
    // Non-blocking
  }

  // Fetch interviews for this application
  const { data: interviews } = await supabase
    .from("interviews")
    .select(`
    id,
    application_id,
    scheduled_by,
    status,
    interview_type,
    available_modes,
    location_details,
    applicant_selection,
    scheduled_at,
    duration_minutes,
    timezone,
    location_address,
    location_notes,
    video_room_url,
    video_room_name,
    video_provider,
    room_not_before,
    room_expires_at,
    interviewer_notes,
    interview_score,
    created_at,
    updated_at,
    profiles ( first_name, last_name, email )
  `)
    .eq("application_id", id)
    .order("scheduled_at", { ascending: false }) as any;

  const { data: contractTemplates } = await supabase
    .from("contract_templates")
    .select("id, template_name, docuseal_template_id")
    .eq("job_posting_id", rawApplication.job_id)
    .order("created_at", { ascending: false });

  const { data: jobOffer } = await supabase
    .from("job_offer_applications")
    .select("id")
    .eq("application_id", application.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const admin = getAdminClient();

  const jobOfferColumns =
    "id, status, salary, start_date, work_setup, work_mode, work_location_id, department, probation_days, latest_docuseal_url, contract_template_id, job_metadata, metadata, is_active, created_at, updated_at";

  const { data: latestJobOffer } = await admin
    .from("job_offers")
    .select(jobOfferColumns)
    .eq("application_id", application.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestJobOfferFallback } = latestJobOffer
    ? { data: null }
    : await admin
      .from("job_offers")
      .select(jobOfferColumns)
      .eq("application_id", application.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  const targetJobOffer = latestJobOffer ?? latestJobOfferFallback;

  const rawJobPosting = application.job_postings as unknown as {
    tenants?: { name?: string | null } | { name?: string | null }[] | null;
    profiles?:
      | {
          company_name?: string | null;
          tenants?: { name?: string | null } | { name?: string | null }[] | null;
        }
      | {
          company_name?: string | null;
          tenants?: { name?: string | null } | { name?: string | null }[] | null;
        }[]
      | null;
  } | null;
  const directTenantName = Array.isArray(rawJobPosting?.tenants)
    ? rawJobPosting?.tenants[0]?.name
    : rawJobPosting?.tenants?.name;
  const creatorProfile = Array.isArray(rawJobPosting?.profiles)
    ? rawJobPosting?.profiles[0]
    : rawJobPosting?.profiles;
  const creatorTenantName = Array.isArray(creatorProfile?.tenants)
    ? creatorProfile?.tenants[0]?.name
    : creatorProfile?.tenants?.name;

  let resolvedOfferEmbedSrc: string | null = null;
  let resolvedOfferLocation: string | null = null;
  let resolvedCompanyName: string | null =
    directTenantName?.trim() ||
    creatorProfile?.company_name?.trim() ||
    creatorTenantName?.trim() ||
    null;

  if (targetJobOffer) {
    const meta = ((targetJobOffer.job_metadata ?? targetJobOffer.metadata) || {}) as Record<string, unknown>;
    if (!resolvedCompanyName && typeof meta.company_name === "string" && meta.company_name.trim()) {
      resolvedCompanyName = meta.company_name.trim();
    }
    if (typeof meta.docuseal_embed_src === "string" && meta.docuseal_embed_src.trim()) {
      resolvedOfferEmbedSrc = meta.docuseal_embed_src.trim();
    } else if (
      String(targetJobOffer.status ?? "").toUpperCase() === "SENT" &&
      targetJobOffer.latest_docuseal_url
    ) {
      try {
        resolvedOfferEmbedSrc = await getOrCreateDocusealEmbedSrc(targetJobOffer.id);
      } catch {
        resolvedOfferEmbedSrc = targetJobOffer.latest_docuseal_url;
      }
    }

    if (targetJobOffer.work_location_id) {
      const { data: branchRow } = await admin
        .from("office_branches")
        .select("name, address")
        .eq("id", targetJobOffer.work_location_id)
        .maybeSingle();
      if (branchRow) {
        resolvedOfferLocation = [branchRow.name, branchRow.address].filter(Boolean).join(", ");
      }
    }
  }

  const { data: latestJobOfferTemplate } = latestJobOffer?.contract_template_id
    ? await admin
      .from("contract_templates")
      .select("id, template_name, docuseal_template_id")
      .eq("id", latestJobOffer.contract_template_id)
      .maybeSingle()
    : { data: null };

  const offerSelect = `
          id,
          status,
          signing_method,
          docuseal_submission_url,
          contract_template_id,
          signed_at,
          contract_templates (
            id,
            template_name,
            docuseal_template_id
          )
        `;

  const { data: activeSignedDocumentById } = application.contract_offer_id
    ? await admin
      .from("signed_documents")
      .select(offerSelect)
      .eq("id", application.contract_offer_id)
      .maybeSingle()
    : { data: null };

  const { data: latestSignedDocumentByApplication } = activeSignedDocumentById
    ? { data: null }
    : await admin
      .from("signed_documents")
      .select(offerSelect)
      .eq("application_id", application.id)
      .in("status", ["sent", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  const activeContractOffer = (latestJobOffer && latestJobOffer.latest_docuseal_url)
    ? {
      id: latestJobOffer.id,
      status: String(latestJobOffer.status ?? "draft").toLowerCase(),
      signing_method: "digital",
      signed_at: null,
      docuseal_submission_url: latestJobOffer.latest_docuseal_url,
      contract_templates: latestJobOffer.contract_template_id && contractTemplates?.length ? [contractTemplates[0]] : [],
    }
    : (latestJobOfferFallback && latestJobOfferFallback.latest_docuseal_url)
      ? {
        id: latestJobOfferFallback.id,
        status: String(latestJobOfferFallback.status ?? "draft").toLowerCase(),
        signing_method: "digital",
        signed_at: null,
        docuseal_submission_url: latestJobOfferFallback.latest_docuseal_url,
        contract_templates: latestJobOfferFallback.contract_template_id && contractTemplates?.length ? [contractTemplates[0]] : [],
      }
      : isActiveSignedDocumentStatus(activeSignedDocumentById?.status)
        ? activeSignedDocumentById
        : latestSignedDocumentByApplication;

  const resolvedActiveContractOffer = activeContractOffer
    ? activeContractOffer
    : latestJobOffer || latestJobOfferFallback
      ? {
        id: (latestJobOffer ?? latestJobOfferFallback)!.id,
        status: String((latestJobOffer ?? latestJobOfferFallback)!.status || "sent").toLowerCase(),
        signing_method: "digital",
        signed_at: null,
        docuseal_submission_url: (latestJobOffer ?? latestJobOfferFallback)!.latest_docuseal_url ?? null,
        contract_template_id: (latestJobOffer ?? latestJobOfferFallback)!.contract_template_id ?? "",
        contract_templates: latestJobOfferTemplate
          ? [latestJobOfferTemplate]
          : [],
      }
      : null;

  const normalizedActiveContractOffer = resolvedActiveContractOffer
    ? {
      ...resolvedActiveContractOffer,
      embed_src: resolvedOfferEmbedSrc ?? resolvedActiveContractOffer.docuseal_submission_url ?? null,
      salary: targetJobOffer?.salary != null ? Number(targetJobOffer.salary) : null,
      start_date: targetJobOffer?.start_date ?? null,
      work_setup: targetJobOffer?.work_setup ?? targetJobOffer?.work_mode ?? null,
      department: targetJobOffer?.department ?? null,
      location: resolvedOfferLocation,
      company_name: resolvedCompanyName || "Hiring Company",
      contract_templates: Array.isArray(resolvedActiveContractOffer.contract_templates)
        ? resolvedActiveContractOffer.contract_templates
        : resolvedActiveContractOffer.contract_templates
          ? [resolvedActiveContractOffer.contract_templates]
          : null,
    }
    : null;

  const offerRouteId =
    normalizedActiveContractOffer?.id ??
    latestJobOffer?.id ??
    jobOffer?.id ??
    null;

  const { data: negotiationRows } = await admin
    .from("job_offer_negotiations")
    .select(
      "id, offer_id, application_id, initiator_id, round, target_field, current_value, requested_value, comments, status, counter_value, hr_comment, resolved_by, created_at, resolved_at"
    )
    .eq("application_id", application.id)
    .order("round", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <PageContainer>
      <ApplicationDetailView
        application={application}
        interviews={interviews ?? []}
        userRole={role}
        isCurrentUser={true}
        contractTemplates={contractTemplates ?? []}
        activeContractOffer={normalizedActiveContractOffer}
        offerId={jobOffer?.id ?? null}
        offerRouteId={offerRouteId}
        negotiations={(negotiationRows ?? []) as OfferNegotiationRow[]}
      />
    </PageContainer>
  );
}
