import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("applications")
      .select("id, status, contract_offer_id, updated_at")
      .eq("id", applicationId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ application: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "unknown" }, { status: 500 });
  }
}
