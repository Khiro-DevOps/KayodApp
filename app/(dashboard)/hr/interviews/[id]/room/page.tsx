import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InterviewRoom from "./interview-room";
import { formatPht, getRoomAccess } from "@/lib/interview-room-access";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: schedule }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("interview_schedules")
      .select("id, room_name, interview_notes, applicant_id, interviewer_id, scheduled_at, duration_minutes, status, meeting_type")
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!profile) {
    notFound();
  }

  if (schedule) {
    if (schedule.meeting_type === "in_person") redirect("/hr/interviews");
    const isHR = ["hr", "hr_manager", "admin"].includes(String(profile.role));
    const isAuthorized = isHR || schedule.interviewer_id === user.id || schedule.applicant_id === user.id;
    if (!isAuthorized || !["scheduled", "confirmed", "rescheduled"].includes(schedule.status)) notFound();
    const access = getRoomAccess(schedule);
    if (access.state !== "open") redirect(`/hr/interviews?message=${encodeURIComponent(access.state === "too_early" ? `Opens at ${formatPht(access.opensAt)} PHT` : "This interview has ended")}`);

    if (!isHR && schedule.applicant_id === user.id) {
      if (!schedule.scheduled_at) notFound();
      const startTime = new Date(schedule.scheduled_at).getTime();
      const endTime = startTime + (schedule.duration_minutes ?? 45) * 60_000;
      const now = new Date().getTime();
      if (now < startTime - 10 * 60_000 || now >= endTime) notFound();
    }

    return (
      <InterviewRoom
        roomId={schedule.room_name ?? schedule.id}
        interviewId={schedule.id}
        initialHrNotes={schedule.interview_notes}
        isHR={isHR}
        closesAt={access.closesAt?.toISOString() ?? null}
      />
    );
  }

  notFound();
}