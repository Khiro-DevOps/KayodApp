import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ interviewId: string }>;
};

export async function PATCH(_request: Request, { params }: RouteContext) {
  const { interviewId } = await params;

  if (!interviewId) {
    return NextResponse.json({ error: "interviewId is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["hr_manager", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: interview, error: interviewError } = await supabase
    .from("interviews")
    .select(`
      id,
      application_id,
      applications (
        job_postings (
          created_by
        )
      )
    `)
    .eq("id", interviewId)
    .single();

  if (interviewError || !interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  const createdBy = (interview.applications as { job_postings?: { created_by?: string } | null } | null)
    ?.job_postings?.created_by;

  if (profile.role === "hr_manager" && createdBy && createdBy !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: interviewUpdateError } = await supabase
    .from("interviews")
    .update({ status: "completed", ended_at: new Date().toISOString() })
    .eq("id", interviewId);

  if (interviewUpdateError) {
    console.error("Failed to update interview:", interviewUpdateError);
    return NextResponse.json({ error: "Failed to complete interview" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    interview: {
      interview_id: interviewId,
      application_id: interview.application_id,
      interview_status: "completed",
    },
  });
}
