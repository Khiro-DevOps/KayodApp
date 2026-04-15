import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { updateApplicationStatus } from "./hr-applications-actions";
import { effectiveRole, isHRRole } from "@/lib/roles";

export default async function HRApplicationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata as any)?.role ?? ((user as any).raw_user_meta_data as any)?.role;
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  // Get all job postings with applicant count
  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, is_published, employment_type")
    .order("created_at", { ascending: false });

  // Get all applications with full details
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id, status, match_score, submitted_at, cover_letter,
      job_posting_id,
      profiles ( id, first_name, last_name, email, phone ),
      resumes ( title, content_text ),
      job_postings ( title )
    `)
    .order("submitted_at", { ascending: false });

  // Group applications by job
  const appsByJob: Record<string, typeof applications> = {};
  (applications ?? []).forEach((app) => {
    const jid = app.job_posting_id;
    if (!appsByJob[jid]) appsByJob[jid] = [];
    appsByJob[jid]!.push(app);
  });

  const totalApps = applications?.length ?? 0;
  const newApps = applications?.filter((a) => a.status === "submitted").length ?? 0;

  return (
    <PageContainer>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Applicants
          </h1>
          <div className="flex gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {totalApps} total
            </span>
            {newApps > 0 && (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                {newApps} new
              </span>
            )}
          </div>
        </div>

        {/* No applications */}
        {totalApps === 0 && (
          <div className="rounded-2xl bg-surface border border-border p-8 text-center space-y-2">
            <p className="text-sm text-text-secondary">No applications yet</p>
            <Link href="/jobs/manage/new" className="inline-block text-sm font-medium text-primary hover:underline">
              Post a job to get started
            </Link>
          </div>
        )}

        {/* Applications grouped by job */}
        {(jobs ?? []).map((job) => {
          const jobApps = appsByJob[job.id] ?? [];
          if (jobApps.length === 0) return null;

          return (
            <section key={job.id} className="space-y-3">
              {/* Job header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{job.title}</h2>
                  <p className="text-xs text-text-secondary capitalize">
                    {job.employment_type.replace("_", " ")} · {jobApps.length} applicant{jobApps.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${job.is_published ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {job.is_published ? "Published" : "Draft"}
                </span>
              </div>

              {/* Applicant cards */}
              {jobApps.map((app) => {
                const candidate = app.profiles as unknown as {
                  id: string; first_name: string; last_name: string;
                  email: string; phone: string | null;
                };
                const resume = app.resumes as unknown as { title: string } | null;
                const fullName = candidate
                  ? `${candidate.first_name} ${candidate.last_name}`
                  : "Unknown";

                return (
                  <div key={app.id} className="rounded-2xl bg-surface border border-border p-4 space-y-3">
                    {/* Candidate info */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">{fullName}</p>
                          <p className="text-xs text-text-secondary truncate">{candidate?.email}</p>
                          {candidate?.phone && (
                            <p className="text-xs text-text-tertiary">{candidate.phone}</p>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${APPLICATION_STATUS_COLORS[app.status as keyof typeof APPLICATION_STATUS_COLORS]}`}>
                        {app.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Resume + match score */}
                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                      {resume && (
                        <span className="flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h4.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-9Z" />
                          </svg>
                          {resume.title}
                        </span>
                      )}
                      {app.match_score !== null && (
                        <span className={`font-medium ${app.match_score >= 70 ? "text-green-600" : app.match_score >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {Math.round(app.match_score)}% match
                        </span>
                      )}
                      <span className="ml-auto">
                        Applied {new Date(app.submitted_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      </span>
                    </div>

                    {/* Cover letter */}
                    {app.cover_letter && (
                      <p className="text-xs text-text-secondary bg-gray-50 rounded-xl px-3 py-2 line-clamp-2">
                        {app.cover_letter}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Schedule interview button */}
                      {["submitted", "under_review", "shortlisted"].includes(app.status) && (
                        <Link
                          href={`/interviews/schedule?applicationId=${app.id}`}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M3.75 2a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.28.53l2.72-2.72 2.72 2.72a.75.75 0 0 0 1.28-.53V2.75a.75.75 0 0 0-.75-.75h-6.5Z" />
                          </svg>
                          Schedule interview
                        </Link>
                      )}

                      {/* Status update dropdown */}
                      <form action={updateApplicationStatus}>
                        <input type="hidden" name="application_id" value={app.id} />
                        <select
                          name="status"
                          onChange={(e) => (e.target.form as HTMLFormElement)?.requestSubmit()}
                          defaultValue={app.status}
                          className="w-full rounded-xl border border-border px-2 py-2 text-xs text-text-secondary bg-white outline-none focus:border-primary"
                        >
                          <option value="submitted">Submitted</option>
                          <option value="under_review">Under review</option>
                          <option value="shortlisted">Shortlisted</option>
                          <option value="interview_scheduled">Interview scheduled</option>
                          <option value="interviewed">Interviewed</option>
                          <option value="offer_sent">Offer sent</option>
                          <option value="hired">Hired</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </form>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </PageContainer>
  );
}
