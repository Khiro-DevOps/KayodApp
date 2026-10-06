import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InterviewRoom from "@/app/(dashboard)/hr/interviews/[id]/room/interview-room";
import { formatPht, getRoomAccess } from "@/lib/interview-room-access";

function RoomUnavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white">
      <div className="max-w-md space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-lg font-bold">Interview room unavailable</h1>
        <p className="text-sm text-slate-400">{message}</p>
        <a href="/applicant/applications" className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500">Back to applications</a>
      </div>
    </div>
  );
}

export default async function ApplicantInterviewRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: schedule } = await supabase
    .from("interview_schedules")
    .select("id, applicant_id, room_name, scheduled_at, duration_minutes, status, interview_notes, meeting_type")
    .eq("id", id)
    .eq("applicant_id", user.id)
    .maybeSingle();

  if (!schedule) return <RoomUnavailable message="This interview does not exist or is not assigned to your account." />;
  if (schedule.meeting_type === "in_person") redirect("/applicant/interviews");
  if (!["scheduled", "confirmed", "rescheduled"].includes(schedule.status)) return <RoomUnavailable message="This interview is not currently scheduled." />;
  if (!schedule.scheduled_at) return <RoomUnavailable message="The interview time has not been confirmed yet." />;

  const access = getRoomAccess(schedule);
  if (access.state !== "open") return <RoomUnavailable message={access.state === "too_early" ? `Opens at ${formatPht(access.opensAt)} PHT` : "This interview has ended"} />;

  return (
    <InterviewRoom
      roomId={schedule.room_name ?? schedule.id}
      interviewId={schedule.id}
      applicationId={undefined}
      initialHrNotes={null}
      isHR={false}
      closesAt={access.closesAt?.toISOString() ?? null}
    />
  );
}
