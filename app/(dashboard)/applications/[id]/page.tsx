import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { effectiveRole, isHRRole } from "@/lib/roles";
import type { Profile, Application } from "@/lib/types";
import ApplicationDetailView from "../application-detail-view";

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
  return ["sent", "negotiating", "pending_review", "pending", "negotiation_pending"].includes(
    String(status).toLowerCase()
  );
}

export default async function ApplicationDetailPage({
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
  const { data: application } = await supabase
    .from("applications")
    .select(`
      id,
      job_posting_id,
      contract_offer_id,
      candidate_id,
      resume_id,
      status,
      cover_letter,
      match_score,
      hr_notes,
      hr_offered_modes,
      hr_office_address,
      selected_mode,
      selected_mode_set_at,
      submitted_at,
      updated_at,
      profiles!applications_candidate_id_fkey ( id, first_name, last_name, email, phone, avatar_url, city, country ),
      resumes ( id, title, pdf_url, content_text ),
      job_postings ( id, title, location, description, salary_min, salary_max, currency, employment_type )
    `)
    .eq("id", id)
    .single<Application>();

  if (!application) {
    redirect("/applications");
  }

  // Repair candidate profile names from auth metadata when stale/missing.
  try {
    const admin = getAdminClient();
    const candidateId = application.candidate_id;
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
    // Non-blocking: keep page working even if admin sync is unavailable.
  }

  // Access control: HR can view any application, candidates can only view their own
  if (!isHR && application.candidate_id !== user.id) {
    redirect("/applications");
  }

  // ── Generate signed resume URL server-side (private bucket requires server auth) ──
  // Fetch interviews for this application
  const { data: interviews, error: interviewError } = await supabase
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
    .eq("job_posting_id", application.job_posting_id)
    .order("created_at", { ascending: false });

  const { data: jobOffer } = await supabase
    .from("job_offer_applications")
    .select("id")
    .eq("application_id", application.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const admin = getAdminClient();

  const { data: latestJobOffer } = await admin
    .from("job_offers")
    .select("id, status, latest_docuseal_url, contract_template_id, created_at")
    .eq("application_id", application.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  const { data: activeContractOfferById } = application.contract_offer_id
    ? await admin
        .from("signed_documents")
        .select(offerSelect)
        .eq("id", application.contract_offer_id)
        .maybeSingle()
    : { data: null };

  const { data: latestContractOfferByApplication } = activeContractOfferById
    ? { data: null }
    : await admin
        .from("signed_documents")
        .select(offerSelect)
        .eq("application_id", application.id)
        .in("status", ["sent", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const activeContractOffer = isActiveSignedDocumentStatus(activeContractOfferById?.status)
    ? activeContractOfferById
    : latestContractOfferByApplication;

  const resolvedActiveContractOffer = activeContractOffer
    ? activeContractOffer
    : latestJobOffer && isActiveJobOfferStatus(latestJobOffer.status)
      ? {
          id: latestJobOffer.id,
          status: String(latestJobOffer.status || "sent").toLowerCase(),
          signing_method: "digital",
          signed_at: null,
          docuseal_submission_url: latestJobOffer.latest_docuseal_url ?? null,
          contract_template_id: latestJobOffer.contract_template_id ?? "",
          contract_templates: latestJobOfferTemplate
            ? [latestJobOfferTemplate]
            : [],
        }
      : null;

  console.log("[ApplicationDetailPage] Contract offer lookup:", {
    applicationId: application.id,
    contractOfferId: application.contract_offer_id ?? null,
    resolvedOfferId: resolvedActiveContractOffer?.id ?? null,
    resolvedStatus: resolvedActiveContractOffer?.status ?? null,
    fallbackJobOfferId: latestJobOffer?.id ?? null,
  });

  const normalizedActiveContractOffer = resolvedActiveContractOffer
    ? {
        ...resolvedActiveContractOffer,
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
    application.id;

  return (
    <PageContainer>
      <ApplicationDetailView
        application={application}
        interviews={interviews ?? []}
        userRole={role}
        isCurrentUser={!isHR}
        contractTemplates={contractTemplates ?? []}
        activeContractOffer={normalizedActiveContractOffer}
        offerId={jobOffer?.id ?? null}
        offerRouteId={offerRouteId}
      />
    </PageContainer>
  );
  
}