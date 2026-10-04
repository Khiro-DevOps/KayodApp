import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { interviewId, notes } = (await req.json()) as { interviewId?: string; notes?: string };

  if (!interviewId) {
    return Response.json({ error: "interviewId is required" }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: schedule, error: scheduleLookupError } = await admin
    .from("interview_schedules")
    .select("id")
    .eq("id", interviewId)
    .single();

  if (scheduleLookupError || !schedule) {
    return Response.json({ error: "Interview not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("interview_schedules")
    .update({ interview_notes: notes ?? "", updated_at: new Date().toISOString() })
    .eq("id", interviewId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}