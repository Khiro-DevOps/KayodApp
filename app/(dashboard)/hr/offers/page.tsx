import { redirect } from "next/navigation";

import PageContainer from "@/components/ui/page-container";
import { getHrJobScope, getTenantTeamNamesMap, resolveOwnerName } from "@/lib/hr-job-scope";
import {
  markOfferSigned,
  verifyDocusealSubmissionCompleted,
} from "@/lib/offer-lifecycle";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import HROffersListClient, {
  type HROfferJobOption,
  type HROfferListItem,
  type OfferDirectoryStatus,
} from "./hr-offers-list-client";

type Relation<T> = T | T[] | null | undefined;

interface JoinedProfile {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface JoinedJobPosting {
  id: string;
  title?: string | null;
  department_id?: string | null;
  location?: string | null;
  currency?: string | null;
  tenant_id?: string | null;
  created_by?: string | null;
}

interface JoinedJobApplication {
  id: string;
  status?: string | null;
  applicant_id?: string | null;
  job_id?: string | null;
  profiles?: Relation<JoinedProfile>;
  job_postings?: Relation<JoinedJobPosting>;
}

interface RawOfferRow {
  id: string;
  application_id: string;
  job_id?: string | null;
  hr_id?: string | null;
  created_by?: string | null;
  status?: string | null;
  docuseal_submission_id?: string | null;
  salary?: number | null;
  start_date?: string | null;
  work_setup?: string | null;
  work_mode?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  job_applications?: Relation<JoinedJobApplication>;
}

function toSingle<T>(value: Relation<T>): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function resolveOfferCategory(
  offerStatus: string,
  applicationStatus: string,
  hasPendingNegotiations: boolean
): OfferDirectoryStatus {
  const normalizedOffer = offerStatus.trim().toUpperCase();
  const normalizedApp = applicationStatus.trim().toLowerCase();

  if (normalizedOffer === "HIRED" || normalizedApp === "hired") {
    return "Hired";
  }

  if (normalizedOffer === "DECLINED" || normalizedApp === "rejected") {
    return "Declined";
  }

  if (
    normalizedOffer === "NEGOTIATING" ||
    normalizedApp === "negotiating" ||
    hasPendingNegotiations
  ) {
    return "Negotiating";
  }

  if (
    normalizedOffer === "SIGNED" ||
    normalizedOffer === "ACCEPTED" ||
    normalizedApp === "pre_employment"
  ) {
    return "Signed";
  }

  if (normalizedOffer === "DRAFT") {
    return "Draft";
  }

  return "Sent";
}

export default async function HROffersDirectoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ scope?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const initialScope: "mine" | "all" =
    resolvedParams?.scope === "all" ? "all" : "mine";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const authRole = user.user_metadata?.role as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single<Pick<Profile, "role" | "tenant_id">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) {
    redirect("/dashboard");
  }

  const jobScope = await getHrJobScope(supabase, user.id);
  const tenantId = jobScope.tenantId;
  const teamNamesMap = await getTenantTeamNamesMap(supabase, tenantId);

  const admin = getAdminClient();

  const buildSelect = (applicationRelation: string) => `
    id,
    application_id,
    job_id,
    hr_id,
    created_by,
    status,
    docuseal_submission_id,
    salary,
    start_date,
    work_setup,
    work_mode,
    updated_at,
    created_at,
    ${applicationRelation} (
      id,
      status,
      applicant_id,
      job_id,
      profiles!job_applications_applicant_id_fkey (
        first_name,
        last_name,
        email
      ),
      job_postings!job_applications_job_id_fkey (
        id,
        title,
        department_id,
        location,
        currency,
        tenant_id,
        created_by
      )
    )
  `;

  let rawOffers: RawOfferRow[] = [];

  const primaryRes = await admin
    .from("job_offers")
    .select(buildSelect("job_applications!job_offers_application_id_fkey"))
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (!primaryRes.error && primaryRes.data) {
    rawOffers = primaryRes.data as unknown as RawOfferRow[];
  } else {
    const fallbackRes = await admin
      .from("job_offers")
      .select(buildSelect("job_applications!job_offers_application_id_job_applications_fkey"))
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (!fallbackRes.error && fallbackRes.data) {
      rawOffers = fallbackRes.data as unknown as RawOfferRow[];
    }
  }

  const scopedOffers = rawOffers.filter((offer) => {
    const app = toSingle(offer.job_applications);
    const job = toSingle(app?.job_postings);
    if (!app || !job) {
      return offer.created_by === user.id || offer.hr_id === user.id;
    }
    if (job.created_by === user.id || offer.created_by === user.id || offer.hr_id === user.id) {
      return true;
    }
    if (tenantId && job.tenant_id === tenantId) {
      return true;
    }
    return false;
  });

  const sentWithSub = scopedOffers.filter(
    (offer) =>
      String(offer.status ?? "").toUpperCase() === "SENT" &&
      Boolean(offer.docuseal_submission_id)
  );

  if (sentWithSub.length > 0) {
    await Promise.all(
      sentWithSub.map(async (offer) => {
        try {
          const completed = await verifyDocusealSubmissionCompleted(offer.docuseal_submission_id);
          if (completed) {
            await markOfferSigned({
              applicationId: offer.application_id,
              offerId: offer.id,
              source: "hr_offers_list_reconcile",
            });
            offer.status = "SIGNED";
            const app = toSingle(offer.job_applications);
            if (app && app.status !== "hired") {
              app.status = "pre_employment";
            }
          }
        } catch (err) {
          console.error("[HROffersDirectory] DocuSeal reconciliation failed:", err);
        }
      })
    );
  }

  const applicationIds = Array.from(
    new Set(scopedOffers.map((offer) => offer.application_id).filter(Boolean))
  );

  const negotiationsByApplication = new Map<
    string,
    { total: number; pending: number }
  >();

  if (applicationIds.length > 0) {
    const { data: negotiationRows } = await admin
      .from("job_offer_negotiations")
      .select("id, application_id, status")
      .in("application_id", applicationIds);

    for (const row of negotiationRows ?? []) {
      const appId = String(row.application_id ?? "");
      if (!appId) continue;
      const current = negotiationsByApplication.get(appId) ?? { total: 0, pending: 0 };
      current.total += 1;
      if (String(row.status ?? "").toLowerCase() === "pending") {
        current.pending += 1;
      }
      negotiationsByApplication.set(appId, current);
    }
  }

  const distinctJobsMap = new Map<string, HROfferJobOption>();

  const mappedOffers: HROfferListItem[] = scopedOffers.map((offer) => {
    const app = toSingle(offer.job_applications);
    const candidate = toSingle(app?.profiles);
    const job = toSingle(app?.job_postings);

    const jobId = job?.id ?? offer.job_id ?? "";
    const jobTitle = job?.title?.trim() || "Job Offer";

    if (jobId && !distinctJobsMap.has(jobId)) {
      distinctJobsMap.set(jobId, { id: jobId, title: jobTitle });
    }

    const candidateName =
      [candidate?.first_name?.trim(), candidate?.last_name?.trim()]
        .filter(Boolean)
        .join(" ")
        .trim() || "Candidate";
    const candidateEmail = candidate?.email?.trim() || "";
    const rawOfferStatus = String(offer.status ?? "DRAFT");
    const rawApplicationStatus = String(app?.status ?? "");
    const negCounts = negotiationsByApplication.get(offer.application_id) ?? {
      total: 0,
      pending: 0,
    };

    const normalizedCategory = resolveOfferCategory(
      rawOfferStatus,
      rawApplicationStatus,
      negCounts.pending > 0
    );

    return {
      id: offer.id,
      applicationId: offer.application_id,
      jobId,
      jobTitle,
      jobCreatedBy: job?.created_by ?? offer.created_by ?? offer.hr_id ?? null,
      ownerName: resolveOwnerName(teamNamesMap, job?.created_by ?? offer.created_by ?? offer.hr_id, "full"),
      candidateName,
      candidateEmail,
      rawOfferStatus,
      rawApplicationStatus,
      normalizedCategory,
      pendingNegotiationsCount: negCounts.pending,
      totalNegotiationsCount: negCounts.total,
      salary: offer.salary != null ? Number(offer.salary) : null,
      currency: job?.currency?.trim() || "PHP",
      startDate: offer.start_date ?? null,
      workSetup: offer.work_setup ?? offer.work_mode ?? null,
      updatedAt: offer.updated_at ?? offer.created_at ?? new Date().toISOString(),
    };
  });

  const jobOptions = Array.from(distinctJobsMap.values());

  return (
    <PageContainer>
      <HROffersListClient
        offers={mappedOffers}
        jobOptions={jobOptions}
        currentUserId={user.id}
        initialScope={initialScope}
      />
    </PageContainer>
  );
}
