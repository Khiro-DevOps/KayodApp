import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Interview, Profile } from "@/lib/types";
import { effectiveRole, isHRRole } from "@/lib/roles";
import Link from "next/link";
import { InterviewCardClient } from "./interview-card-client";
import { InterviewCalendar } from "./interview-calendar";

export default async function InterviewsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role as string | undefined) ?? null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Profile>();

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);

  let interviews: Interview[] = [];

  const now = new Date();

  if (isHR) {
    const { data, error } = await supabase
      .from("interviews")
      .select(`
        *,
        applications (
          *,
          profiles!applications_candidate_id_fkey ( first_name, last_name, email ),
          job_postings ( title )
        )
      `)
      .order("scheduled_at", { ascending: true });

    console.log("HR Supabase error:", error);
    console.log("HR data length:", data?.length);
    interviews = (data as Interview[]) ?? [];
  } else {
    const { data, error } = await supabase
      .from("interviews")
      .select(`
        *,
        applications!inner (
          *,
          job_postings ( title )
        )
      `)
      .filter("applications.candidate_id", "eq", user.id)
      .order("scheduled_at", { ascending: true });

    console.log("Applicant Supabase error:", error);
    console.log("Applicant data length:", data?.length);
    interviews = (data as Interview[]) ?? [];
  }

  console.log("=== INTERVIEW DEBUG ===");
  interviews.forEach((i) => {
    const scheduledAt = new Date(i.scheduled_at).getTime();
    const durationMs = (i.duration_minutes ?? 60) * 60000;
    console.log({
      id: i.id,
      status: i.status,
      scheduled_at: i.scheduled_at,
      duration_minutes: i.duration_minutes,
      now: now.toISOString(),
      endTime: new Date(scheduledAt + durationMs).toISOString(),
      isExpired: scheduledAt + durationMs <= now.getTime(),
    });
  });

  const upcoming = interviews.filter((i) => {
    if (i.status === "cancelled" || i.status === "completed") return false;
    const scheduledAt = new Date(i.scheduled_at).getTime();
    if (!Number.isFinite(scheduledAt)) return false;
    const durationMs = (i.duration_minutes ?? 60) * 60000;
    return scheduledAt + durationMs > now.getTime();
  });

  const past = interviews.filter((i) => {
    if (i.status === "cancelled" || i.status === "completed") return true;
    const scheduledAt = new Date(i.scheduled_at).getTime();
    if (!Number.isFinite(scheduledAt)) return true;
    const durationMs = (i.duration_minutes ?? 60) * 60000;
    return scheduledAt + durationMs <= now.getTime();
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaysInterviews = interviews.filter((i) => {
    const scheduled = new Date(i.scheduled_at);
    return scheduled >= today && scheduled < tomorrow && i.status !== "cancelled";
  });

  return (
    <div className="flex gap-6">
      {/* Today's Interviews Sidebar */}
      <div className="w-80 shrink-0">
        <div className="sticky top-4 space-y-4">
          <div className="rounded-2xl bg-surface border border-border p-4">
            <h2 className="text-sm font-semibold text-text-primary mb-3">
              Today&apos;s Interviews ({todaysInterviews.length})
            </h2>
            {todaysInterviews.length === 0 ? (
              <p className="text-xs text-text-secondary">No interviews scheduled for today</p>
            ) : (
              <div className="space-y-2">
                {todaysInterviews.map((interview) => {
                  const app = interview.applications;
                  const jobTitle = app?.job_postings?.title ?? "Interview";
                  const candidate = isHR ? app?.profiles : null;
                  const candidateName = candidate
                    ? `${candidate.first_name ?? ""} ${candidate.last_name ?? ""}`.trim()
                    : "You've";

                  return (
                    <div key={interview.id} className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs font-medium text-text-primary">
                        {new Date(interview.scheduled_at).toLocaleTimeString("en-PH", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">{jobTitle}</p>
                      <p className="text-xs text-text-secondary">{candidateName}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <PageContainer>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
                  </svg>
                </Link>
                <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
                  Interviews
                </h1>
              </div>
              {isHR && (
                <Link
                  href="/interviews/schedule"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                >
                  Schedule
                </Link>
              )}
            </div>

            {/* Calendar View for HR */}
            {isHR && (
              <div className="space-y-4">
                <InterviewCalendar interviews={interviews} />
              </div>
            )}

            {/* Upcoming */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
                Upcoming ({upcoming.length})
              </h2>
              {upcoming.length === 0 ? (
                <EmptyState message="No upcoming interviews" />
              ) : (
                upcoming.map((interview) => (
                  <InterviewCardClient
                    key={interview.id}
                    interview={interview}
                    isHR={isHR}
                    showTypeSelection={!isHR}
                  />
                ))
              )}
            </section>

            {/* Past */}
            {past.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
                  Past ({past.length})
                </h2>
                {past.map((interview) => (
                  <InterviewCardClient
                    key={interview.id}
                    interview={interview}
                    isHR={isHR}
                    past={true}
                  />
                ))}
              </section>
            )}
          </div>
        </PageContainer>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-6 text-center">
      <p className="text-sm text-text-secondary">{message}</p>
    </div>
  );
}