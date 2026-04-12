import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ hasResume: false }, { status: 401 });
    }

    const { count } = await supabase
      .from("resumes")
      .select("*", { count: "exact", head: true })
      .eq("candidate_id", user.id);

    return NextResponse.json({ hasResume: (count ?? 0) > 0 });
  } catch (error) {
    console.error("Error checking resume:", error);
    return NextResponse.json({ hasResume: false }, { status: 500 });
  }
}