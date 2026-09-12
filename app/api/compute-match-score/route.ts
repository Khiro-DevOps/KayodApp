import { NextResponse } from "next/server";
import { computeAndStoreMatchScore } from "@/lib/compute-match-score";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { application_id?: string; force?: boolean };
  const applicationId = typeof body.application_id === "string" ? body.application_id.trim() : "";
  const forceRecompute = body.force === true;

  if (!applicationId) {
    return NextResponse.json({ error: "application_id is required" }, { status: 400 });
  }

  const result = await computeAndStoreMatchScore(applicationId, forceRecompute);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  return NextResponse.json(result, { status: 200 });
}