import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const interviewId = url.searchParams.get("interviewId");
  const applicationId = url.searchParams.get("applicationId");

  // If no params provided, return recent interviews for quick lookup
  if (!interviewId && !applicationId) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("interviews")
        .select("id, application_id, scheduled_at, status, interview_type")
        .order("scheduled_at", { ascending: false })
        .limit(50);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ recent: data || [] });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message || "unknown" }, { status: 500 });
    }
  }

  try {
    const supabase = await createClient();

    if (interviewId) {
      const { data, error } = await supabase.from("interviews").select("*").eq("id", interviewId).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ interview: data });
    }

    const { data, error } = await supabase
      .from("interviews")
      .select("*")
      .eq("application_id", applicationId)
      .order("scheduled_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ interviews: data || [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "unknown" }, { status: 500 });
  }
}
