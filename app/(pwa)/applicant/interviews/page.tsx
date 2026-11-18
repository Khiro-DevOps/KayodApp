import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SlotBookingCard, type InterviewScheduleItem } from "./_components/SlotBookingCard";
import { getRoomAccess } from "@/lib/interview-room-access";
import { getPhtDateGroup } from "@/lib/interview-date";

export default async function ApplicantInterviewsPage({ searchParams }: { searchParams?: Promise<{ view?: string; q?: string }> }) {
  const params = await searchParams;
  const view = params?.view === "history" ? "history" : "upcoming";
  const query = params?.q?.trim().toLowerCase() ?? "";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Query interview_schedules joined with job_applications, job_postings, and interviewer profile
  const { data: schedulesData, error } = await supabase
    .from("interview_schedules")
    .select(`
      id,
      application_id,
      interviewer_id,
      applicant_id,
      proposed_slots,
      selected_slot,
      scheduled_at,
      duration_minutes,
      status,
      reschedule_reason,
      meeting_link,
      meeting_type,
      office_branch:office_branches ( name, address ),
      job_applications (
        id,
        job_postings (
          title
        )
      ),
      interviewer:profiles!interview_schedules_interviewer_id_fkey (
        first_name,
        last_name
      )
    `)
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching applicant interview schedules:", error);
  }

  const rawSchedules = schedulesData || [];

  const formattedSchedules: InterviewScheduleItem[] = rawSchedules.map((item: any) => {
    const interviewerName = item.interviewer
      ? `${item.interviewer.first_name || ""} ${item.interviewer.last_name || ""}`.trim()
      : null;
    const jobTitle = item.job_applications?.job_postings?.title || "Interview";

    return {
      id: item.id,
      application_id: item.application_id,
      interviewer_id: item.interviewer_id,
      applicant_id: item.applicant_id,
      proposed_slots: item.proposed_slots || [],
      selected_slot: item.selected_slot,
      scheduled_at: item.scheduled_at,
      duration_minutes: item.duration_minutes || 60,
      status: item.status,
      reschedule_reason: item.reschedule_reason,
      meeting_link: item.meeting_link,
      meeting_type: item.meeting_type ?? "online",
      branchName: item.office_branch?.name ?? null,
      branchAddress: item.office_branch?.address ?? null,
      jobTitle,
      interviewerName,
    };
  });

  const isHistory = (s: InterviewScheduleItem) => ["completed", "cancelled", "no_show"].includes(s.status) || getRoomAccess(s).state === "ended";
  const filteredSchedules = formattedSchedules.filter((s) => `${s.jobTitle} ${s.interviewerName ?? ""}`.toLowerCase().includes(query));
  const visibleSchedules = filteredSchedules.filter((s) => view === "history" ? isHistory(s) : !isHistory(s));
  const groupedSchedules = visibleSchedules.reduce<Record<string, InterviewScheduleItem[]>>((groups, item) => {
    const key = getPhtDateGroup(item.scheduled_at ?? item.selected_slot?.start_time ?? item.proposed_slots?.[0]?.start_time);
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});

  return (
    <div className="w-full max-w-3xl min-w-0 flex flex-col mx-auto px-4 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-purple-600">
              Interview Management
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Your Interview Schedule
            </h1>
          </div>
          <Link
            href="/applicant/dashboard"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shrink-0 shadow-xs"
          >
            Back
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/applicant/interviews?view=upcoming"
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                view === "upcoming"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              Upcoming
            </Link>
            <Link
              href="/applicant/interviews?view=history"
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                view === "history"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              History
            </Link>
          </div>
          <form className="flex w-full sm:w-64 min-w-0 gap-2" action="/applicant/interviews">
            <input name="view" type="hidden" value={view} />
            <input
              name="q"
              defaultValue={params?.q ?? ""}
              placeholder="Search interviews..."
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
            />
          </form>
        </div>
      </div>

      {/* Invites / Upcoming Section */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          {view === "history" ? `History (${visibleSchedules.length})` : `Upcoming (${visibleSchedules.length})`}
        </h2>

        {visibleSchedules.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-center shadow-sm space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-purple-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-900">No Pending Invites</p>
            <p className="text-xs text-slate-600">
              You don&apos;t have any active interview invitations or upcoming calls right now.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedSchedules).map(([group, interviews]) => (
              <section key={group} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group}</h3>
                {interviews.map((interview) => (
                  <SlotBookingCard key={interview.id} interview={interview} />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Past / Completed Section */}
    </div>
  );
}
