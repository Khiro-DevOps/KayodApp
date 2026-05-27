import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { interviewId, notes } = (await req.json()) as { interviewId?: string; notes?: string };

  if (!interviewId) {
    return Response.json({ error: "interviewId is required" }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: interviewRow, error: interviewLookupError } = await admin
    .from("interviews")
    .select("application_id, scheduled_by")
    .eq("id", interviewId)
    .single();

  if (interviewLookupError || !interviewRow?.application_id || !interviewRow?.scheduled_by) {
    return Response.json({ error: "Interview not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("interviews")
    .update({ hr_notes: notes ?? null })
    .eq("id", interviewId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const { error: notesSyncError } = await admin
    .from("interview_notes")
    .upsert(
      {
        interview_id: interviewId,
        application_id: interviewRow.application_id,
        created_by: interviewRow.scheduled_by,
        general_notes: notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "interview_id" }
    );

  if (notesSyncError) {
    return Response.json({ error: notesSyncError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}