import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { effectiveRole, isHRRole } from "@/lib/roles";

export default async function ApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string; appId: string }>;
}) {
  const { id, appId } = await params;
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

  const { data: application, error } = await supabase
    .from("applications")
    .select(`
      id,
      job_posting_id,
      candidate_id,
      status,
      match_score,
      submitted_at,
      cover_letter,
      hr_notes,
      resume_id,
      profiles!applications_candidate_id_fkey (id, first_name, last_name, email, phone, city, country)
    `)
    .eq("id", appId)
    .eq("job_posting_id", id)
    .single();

  if (error) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <Link
            href={`/jobs/manage/${id}/applicants`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
            <h2 className="text-lg font-semibold text-red-900 mb-2">Failed to load applicant</h2>
            <div className="space-y-2 text-sm text-red-700">
              <p><strong>Error:</strong> {error.message}</p>
              <p><strong>Code:</strong> {error.code}</p>
              <p><strong>App ID:</strong> {appId}</p>
              <p><strong>Job ID:</strong> {id}</p>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!application) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <Link
            href={`/jobs/manage/${id}/applicants`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-6">
            <h2 className="text-lg font-semibold text-yellow-900 mb-2">Applicant not found</h2>
            <p className="text-sm text-yellow-700 mb-4">
              No application found with ID <code className="bg-yellow-100 px-2 py-1 rounded text-xs">{appId}</code> for job <code className="bg-yellow-100 px-2 py-1 rounded text-xs">{id}</code>
            </p>
            <Link
              href={`/jobs/manage/${id}/applicants`}
              className="inline-block text-primary hover:underline text-sm font-medium"
            >
              ← Back to applicants
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Fetch resume separately since resume_id is a plain FK column
  const { data: resume } = application.resume_id
    ? await supabase
        .from("resumes")
        .select("id, title, pdf_url")
        .eq("id", application.resume_id)
        .single()
    : { data: null };

  const candidate = (application.profiles as any) as {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    city: string;
    country: string;
  } | null;

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/jobs/manage/${id}/applicants`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary truncate">
              Applicant profile
            </h1>
            <p className="text-xs text-text-secondary truncate">{job.title}</p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-medium ${
            application.status === "submitted" ? "bg-blue-50 text-blue-700"
            : application.status === "under_review" ? "bg-amber-50 text-amber-700"
            : application.status === "shortlisted" ? "bg-green-50 text-green-700"
            : application.status === "interview_scheduled" ? "bg-purple-50 text-purple-700"
            : application.status === "interviewed" ? "bg-indigo-50 text-indigo-700"
            : application.status === "offer_sent" ? "bg-emerald-50 text-emerald-700"
            : application.status === "hired" ? "bg-emerald-50 text-emerald-700"
            : application.status === "rejected" ? "bg-red-50 text-red-700"
            : "bg-gray-100 text-gray-700"
          }`}>
            {application.status.replace(/_/g, " ")}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
          <section className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-secondary">Candidate</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">
                {candidate?.first_name} {candidate?.last_name}
              </h2>
              <p className="text-sm text-text-secondary">
                Applied on {new Date(application.submitted_at).toLocaleDateString()}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs text-text-secondary mb-1">Email</p>
                <p className="text-text-primary">{candidate?.email || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-1">Phone</p>
                <p className="text-text-primary">{candidate?.phone || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-1">Location</p>
                <p className="text-text-primary">
                  {candidate?.city ? `${candidate.city}, ${candidate.country}` : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-1">Match Score</p>
                <p className="text-text-primary">{application.match_score ?? "-"}</p>
              </div>
            </div>

            {resume && (
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs text-text-secondary mb-1">Resume</p>
                <p className="text-sm font-medium text-text-primary">
                  {resume.title || "Untitled resume"}
                </p>
              </div>
            )}

            {application.cover_letter && (
              <div>
                <p className="text-xs text-text-secondary mb-2">Cover Letter</p>
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-text-primary whitespace-pre-wrap">
                  {application.cover_letter}
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Actions</h3>
              <Link
                href={`/jobs/manage/${id}/applicants/${appId}/interview`}
                className="block rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-white hover:bg-primary/90"
              >
                Schedule interview
              </Link>
              <Link
                href={`/jobs/manage/${id}/applicants/${appId}/offer`}
                className="block rounded-xl border border-border px-4 py-3 text-center text-sm font-medium text-text-primary hover:bg-gray-50"
              >
                Create offer
              </Link>
              <Link
                href={`/jobs/manage/${id}/applicants`}
                className="block text-center text-xs text-primary hover:underline"
              >
                Back to applicants list
              </Link>
            </div>

            {application.hr_notes && (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-sm font-semibold text-text-primary mb-2">HR Notes</p>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">
                  {application.hr_notes}
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}