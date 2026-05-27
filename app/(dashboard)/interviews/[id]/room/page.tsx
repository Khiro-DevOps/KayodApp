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

  const [{ data: profile }, { data: interview }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("interviews").select("id, room_id, hr_notes, application_id").eq("id", id).single(),
  ]);

  if (!profile || !interview) {
    notFound();
  }

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