import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Interview, Profile } from "@/lib/types";
import Link from "next/link";
import { InterviewCardClient } from "./interview-card-client";
import { InterviewCalendar } from "./interview-calendar";

export default async function InterviewsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Profile>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";

  let interviews: Interview[] = [];

  if (isHR) {
    const { data } = await supabase
      .from("interviews")
      .select(`
        *,
        applications (
          *,
          profiles ( first_name, last_name, email ),
          job_postings ( title )
        )
      `)
      .order("scheduled_at", { ascending: true });
    interviews = (data as Interview[]) ?? [];
  } else {
    const { data } = await supabase
      .from("interviews")
      .select(`
        *,
        applications!inner (
          *,
          job_postings ( title )
        )
      `)
      .eq("applications.candidate_id", user.id)
      .order("scheduled_at", { ascending: true });
    interviews = (data as Interview[]) ?? [];
  }

  const upcoming = interviews.filter(
    (i) => new Date(i.scheduled_at) >= new Date() && i.status !== "cancelled"
  );
  const past = interviews.filter(
    (i) => new Date(i.scheduled_at) < new Date() || i.status === "completed"
  );

  return (
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
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-6 text-center">
      <p className="text-sm text-text-secondary">{message}</p>
    </div>
  );
}
