import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Application, Profile } from "@/lib/types";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
import Link from "next/link";

export default async function ApplicationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";

  let applications: Application[] = [];

  if (isHR) {
    // HR sees all applications
    const { data } = await supabase
      .from("applications")
      .select(`
        *,
        job_postings ( title, location, employment_type ),
        profiles ( first_name, last_name, email ),
        resumes ( title )
      `)
      .order("submitted_at", { ascending: false });
    applications = (data as Application[]) ?? [];
  } else {
    // Candidates see their own applications
    const { data } = await supabase
      .from("applications")
      .select(`
        *,
        job_postings ( title, location, employment_type ),
        resumes ( title )
      `)
      .eq("candidate_id", user.id)
      .order("submitted_at", { ascending: false });
    applications = (data as Application[]) ?? [];
  }

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            {isHR ? "All Applications" : "My Applications"}
          </h1>
          <span className="text-sm text-text-secondary">
            {applications.length} total
          </span>
        </div>

        {applications.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-border p-6 text-center space-y-2">
            <p className="text-sm text-text-secondary">No applications yet</p>
            {!isHR && (
              <Link
                href="/jobs"
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                Browse Jobs
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => {
              const job = app.job_postings as unknown as {
                title: string;
                location: string | null;
                employment_type: string;
              };
              const candidate = app.profiles as unknown as {
                first_name: string;
                last_name: string;
                email: string;
              } | null;

              return (
                <div
                  key={app.id}
                  className="rounded-2xl bg-surface border border-border p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {job?.title ?? "Position"}
                      </p>
                      {isHR && candidate && (
                        <p className="text-xs text-text-secondary">
                          {candidate.first_name} {candidate.last_name} · {candidate.email}
                        </p>
                      )}
                      {job?.location && (
                        <p className="text-xs text-text-secondary">{job.location}</p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${APPLICATION_STATUS_COLORS[app.status]}`}>
                      {app.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  {app.match_score !== null && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${app.match_score}%` }}
                        />
                      </div>
                      <span className="text-xs text-text-secondary shrink-0">
                        {Math.round(app.match_score)}% match
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>
                      Applied {new Date(app.submitted_at).toLocaleDateString("en-PH", {
                        month: "short", day: "numeric", year: "numeric"
                      })}
                    </span>
                    {isHR && (
                      <div className="flex gap-2">
                        {(["under_review", "shortlisted", "interview_scheduled", "offer_sent", "hired", "rejected"] as const).map((s) => (
                          app.status !== s && (
                            <form key={s} method="POST" action="/api/applications/status">
                              <input type="hidden" name="application_id" value={app.id} />
                              <input type="hidden" name="status" value={s} />
                              <button
                                type="submit"
                                className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-text-secondary hover:bg-gray-200 capitalize"
                              >
                                {s.replace(/_/g, " ")}
                              </button>
                            </form>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}