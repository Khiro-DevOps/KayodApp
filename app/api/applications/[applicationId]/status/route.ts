import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { applicationId: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const status = body?.status;

    if (!status) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
    }

    const admin = getAdminClient();

    const { data: app, error: appError } = await admin
      .from("applications")
      .select("id, job_posting_id, job_postings!inner(created_by)")
      .eq("id", params.applicationId)
      .maybeSingle();

    if (appError) {
      return NextResponse.json({ error: appError.message }, { status: 500 });
    }

    const createdBy = (app?.job_postings as { created_by?: string } | null)?.created_by;
    if (!app || createdBy !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await admin
      .from("applications")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", params.applicationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
