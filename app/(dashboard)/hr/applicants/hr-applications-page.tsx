import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { updateApplicationStatus, moveToApplied } from "./hr-applications-actions";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { getAdminClient } from "@/lib/supabase/admin";

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function deriveDisplayName(candidate: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
} | null | undefined): string {
  const firstName = normalizeName(candidate?.first_name);
  const lastName = normalizeName(candidate?.last_name);
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;

  const emailHandle = normalizeName((candidate?.email ?? "").split("@")[0]).replace(/[._-]+/g, " ").trim();
  return emailHandle || "Unknown Applicant";
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

export default async function HRApplicationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role) as string | undefined;
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
      id, status, match_score, submitted_at, cover_letter, candidate_id,
      job_posting_id,
      profiles!applications_candidate_id_fkey ( id, first_name, last_name, email, phone ),
      resumes ( title, content_text ),
      job_postings ( title )
    `)
    .order("submitted_at", { ascending: false });

  // Repair candidate profile names from auth metadata for stale applicant rows.
  try {
    const admin = getAdminClient();
    const apps = (applications ?? []) as Array<{
      candidate_id: string;
      profiles?: {
        first_name?: string | null;
        last_name?: string | null;
      } | null;
    }>;

    const uniqueCandidateIds = Array.from(new Set(apps.map((app) => app.candidate_id).filter(Boolean)));

    for (const candidateId of uniqueCandidateIds) {
      const { data: authData } = await admin.auth.admin.getUserById(candidateId);
      const authUser = authData?.user;
      if (!authUser) continue;

      const { firstName, lastName } = deriveNamesFromUser(authUser);
      if (!firstName && !lastName) continue;

      let needsUpdate = false;
      for (const app of apps) {
        if (app.candidate_id !== candidateId) continue;
        const profile = app.profiles ?? {};
        const currentFirst = normalizeName(profile.first_name);
        const currentLast = normalizeName(profile.last_name);
        if (currentFirst !== firstName || currentLast !== lastName) {
          needsUpdate = true;
          app.profiles = { ...profile, first_name: firstName, last_name: lastName };
        }
      }

      if (needsUpdate) {
        await admin
          .from("profiles")
          .update({ first_name: firstName, last_name: lastName })
          .eq("id", candidateId);
      }
    }
  } catch {
    // Non-blocking: render list even when admin sync is unavailable.
  }

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
                const fullName = deriveDisplayName(candidate);

                return (
                  <Link
                    key={app.id}
                    href={`/applications/${app.id}`}
                    className="block rounded-2xl bg-surface border border-border p-4 space-y-3 hover:border-primary hover:shadow-md transition-all"
                  >
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
                    <div className="space-y-2" onClick={(e) => e.preventDefault()}>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Schedule interview button */}
                        {["submitted", "under_review", "shortlisted"].includes(app.status) && (
                          <Link
                            href={`/interviews/schedule?applicationId=${app.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M3.75 2a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.28.53l2.72-2.72 2.72 2.72a.75.75 0 0 0 1.28-.53V2.75a.75.75 0 0 0-.75-.75h-6.5Z" />
                            </svg>
                            Schedule
                          </Link>
                        )}

                        {/* Status update dropdown */}
                        <form action={updateApplicationStatus} onClick={(e) => e.stopPropagation()}>
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

                        {/* Move to Applied button for rejected */}
                        {app.status === "rejected" && (
                          <form action={moveToApplied} onClick={(e) => e.stopPropagation()}>
                            <input type="hidden" name="application_id" value={app.id} />
                            <button
                              type="submit"
                              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M12.78 1.22a.75.75 0 0 1 0 1.06L2.28 12.78a.75.75 0 0 1-1.06-1.06L11.72 1.22a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                              </svg>
                              Reconsider
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>
    </PageContainer>
  );
}
