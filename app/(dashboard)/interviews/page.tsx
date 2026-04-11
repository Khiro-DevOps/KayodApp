import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Interview, Profile } from "@/lib/types";
import Link from "next/link";

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

        {/* Upcoming */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            Upcoming ({upcoming.length})
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState message="No upcoming interviews" />
          ) : (
            upcoming.map((interview) => (
              <InterviewCard key={interview.id} interview={interview} isHR={isHR} />
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
              <InterviewCard key={interview.id} interview={interview} isHR={isHR} past />
            ))}
          </section>
        )}
      </div>
    </PageContainer>
  );
}

function InterviewCard({
  interview,
  isHR,
  past = false,
}: {
  interview: Interview;
  isHR: boolean;
  past?: boolean;
}) {
  const app = interview.applications as unknown as {
    profiles?: { first_name: string; last_name: string; email: string };
    job_postings?: { title: string };
  };

  const candidateName = app?.profiles
    ? `${app.profiles.first_name} ${app.profiles.last_name}`
    : "Candidate";
  const jobTitle = app?.job_postings?.title ?? "Position";
  const scheduledDate = new Date(interview.scheduled_at);

  const statusColors: Record<string, string> = {
    scheduled:    "bg-blue-50 text-blue-700",
    confirmed:    "bg-green-50 text-green-700",
    completed:    "bg-gray-100 text-gray-600",
    cancelled:    "bg-red-50 text-red-700",
    rescheduled:  "bg-yellow-50 text-yellow-700",
    no_show:      "bg-red-50 text-red-600",
  };

  return (
    <div className={`rounded-2xl bg-surface border border-border p-4 space-y-3 ${past ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {isHR ? candidateName : jobTitle}
          </p>
          <p className="text-xs text-text-secondary truncate">
            {isHR ? jobTitle : "Interview"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[interview.status] ?? "bg-gray-100 text-gray-600"}`}>
          {interview.status.replace("_", " ")}
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M5.75 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM5 10.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM10.25 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM9.5 10.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM7.25 8.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Z" />
            <path fillRule="evenodd" d="M4.75 1a.75.75 0 0 0-.75.75V3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2V1.75a.75.75 0 0 0-1.5 0V3h-5V1.75A.75.75 0 0 0 4.75 1ZM3.5 7a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5Z" clipRule="evenodd" />
          </svg>
          {scheduledDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <span className="flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
          </svg>
          {scheduledDate.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
          {" · "}{interview.duration_minutes} min
        </span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${interview.interview_type === "online" ? "bg-purple-50 text-purple-700" : "bg-amber-50 text-amber-700"}`}>
          {interview.interview_type === "online" ? "Online" : "In-person"}
        </span>
      </div>

      {interview.interview_type === "online" && interview.video_room_url && !past && (
        <a
          href={`/interviews/${interview.id}`}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3.25 4A2.25 2.25 0 0 0 1 6.25v7.5A2.25 2.25 0 0 0 3.25 16h7.5A2.25 2.25 0 0 0 13 13.75v-7.5A2.25 2.25 0 0 0 10.75 4h-7.5ZM19 4.75a.75.75 0 0 0-1.28-.53l-3 3a.75.75 0 0 0-.22.53v4.5c0 .199.079.39.22.53l3 3a.75.75 0 0 0 1.28-.53V4.75Z" />
          </svg>
          Join video call
        </a>
      )}

      {interview.interview_type === "in_person" && interview.location_address && (
        <p className="text-xs text-text-secondary bg-amber-50 rounded-xl px-3 py-2">
          📍 {interview.location_address}
          {interview.location_notes && ` — ${interview.location_notes}`}
        </p>
      )}
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
