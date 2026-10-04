import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InterviewRoom from "./interview-room";

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
      .select("id, room_name, interview_notes, applicant_id, interviewer_id, scheduled_at, duration_minutes, status")
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!profile) {
    notFound();
  }

  if (schedule) {
    const isHR = ["hr", "hr_manager", "admin"].includes(String(profile.role));
    const isAuthorized = isHR || schedule.interviewer_id === user.id || schedule.applicant_id === user.id;
    if (!isAuthorized || schedule.status !== "scheduled") notFound();

    if (!isHR && schedule.applicant_id === user.id) {
      if (!schedule.scheduled_at) notFound();
      const startTime = new Date(schedule.scheduled_at).getTime();
      const endTime = startTime + (schedule.duration_minutes ?? 45) * 60_000;
      const now = Date.now();
      if (now < startTime - 10 * 60_000 || now >= endTime) notFound();
    }

    return (
      <InterviewRoom
        roomId={schedule.room_name ?? schedule.id}
        interviewId={schedule.id}
        initialHrNotes={schedule.interview_notes}
        isHR={isHR}
      />
    );
  }

  const { data: interview } = await supabase
    .from("interviews")
    .select("id, room_id, hr_notes, application_id")
    .eq("id", id)
    .single();

  if (!interview) notFound();

  const isHR = profile.role === "hr_manager" || profile.role === "admin";

  const { data: interviewNotes } = interview.application_id
    ? await supabase
        .from("interview_notes")
        .select("general_notes")
        .eq("application_id", interview.application_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const initialHrNotes = interviewNotes?.general_notes ?? interview.hr_notes;

  return (
    <InterviewRoom
      roomId={(interview.room_id as string | null) ?? id}
      interviewId={interview.id}
      applicationId={interview.application_id}
      initialHrNotes={initialHrNotes}
      isHR={isHR}
    />
  );
}