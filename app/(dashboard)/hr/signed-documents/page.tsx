import PageContainer from "@/components/ui/page-container";
import SignedDocumentsTable from "@/components/hr/SignedDocumentsTable";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { redirect } from "next/navigation";

type JobPostingRow = {
  id: string;
};

type JobOfferRow = {
  id: string;
  application_id: string;
  job_posting_id: string;
  status: string;
  updated_at: string;
  job_metadata: Record<string, unknown> | null;
};

type ApplicationRow = {
  id: string;
  candidate_id: string;
  status: string;
  submitted_at: string;
  updated_at: string;
  profiles?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
  job_postings?: {
    title?: string | null;
  } | null;
};

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatCandidateName(profile: ApplicationRow["profiles"]) {
  const firstName = profile?.first_name?.trim() ?? "";
  const lastName = profile?.last_name?.trim() ?? "";
  return [firstName, lastName].filter(Boolean).join(" ").trim() || profile?.email || "Unknown Applicant";
}

export default async function SignedDocumentsPage() {
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

  const { data: ownedJobPostings } = await admin
    .from("job_postings")
    .select("id")
    .eq("created_by", user.id)
    .returns<JobPostingRow[]>();

  const ownedJobPostingIds = (ownedJobPostings ?? []).map((jobPosting) => jobPosting.id);

  if (!isHRRole(role) && ownedJobPostingIds.length === 0) {
    redirect("/dashboard");
  }

  if (ownedJobPostingIds.length === 0) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div>
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
              Signed Documents
            </h1>
            <p className="text-sm text-text-secondary">
              Review signed offer letters before confirming hires.
            </p>
          </div>
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="text-sm font-medium text-text-primary">No job postings found</p>
            <p className="mt-1 text-sm text-text-secondary">
              Create a job posting first so signed contracts appear here.
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  const { data: offers } = await admin
    .from("job_offers")
    .select("id, application_id, job_posting_id, status, updated_at, job_metadata")
    .in("job_posting_id", ownedJobPostingIds)
    .in("status", ["SIGNED", "signed", "accepted", "HIRED", "hired"])
    .order("updated_at", { ascending: false })
    .returns<JobOfferRow[]>();

  const applicationIds = (offers ?? []).map((offer) => offer.application_id);

  const { data: applications } = applicationIds.length
    ? await admin
        .from("applications")
        .select(`
          id,
          candidate_id,
          status,
          submitted_at,
          updated_at,
          profiles!applications_candidate_id_fkey (
            first_name,
            last_name,
            email,
            avatar_url
          ),
          job_postings (
            title
          )
        `)
        .in("id", applicationIds)
        .returns<ApplicationRow[]>()
    : { data: [] as ApplicationRow[] };

  const applicationMap = new Map((applications ?? []).map((application) => [application.id, application]));

  const documents = (offers ?? []).map((offer) => {
    const application = applicationMap.get(offer.application_id);
    const profileData = toSingle(application?.profiles) ?? null;
    const jobPosting = toSingle(application?.job_postings) ?? null;

    return {
      applicationId: offer.application_id,
      jobOfferId: offer.id,
      candidateName: formatCandidateName(profileData),
      candidateEmail: profileData?.email ?? "",
      candidateAvatarUrl: profileData?.avatar_url ?? null,
      jobTitle: jobPosting?.title ?? "Untitled position",
      signedAt: offer.updated_at,
      applicationStatus: application?.status ?? "",
      offerStatus: offer.status,
    };
  });

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Signed Documents
          </h1>
          <p className="text-sm text-text-secondary">
            Review completed offer letters and confirm the hire when the contract looks correct.
          </p>
        </div>

        <SignedDocumentsTable documents={documents} />
      </div>
    </PageContainer>
  );
}