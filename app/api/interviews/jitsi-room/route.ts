// app/api/interviews/jitsi-room/route.ts
// Generates a JaaS (8x8 Jitsi as a Service) room for an online interview.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const JAAS_APP_ID = process.env.JAAS_APP_ID!;

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["hr_manager", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { interviewId, scheduledAt } = await request.json();

  if (!interviewId) {
    return NextResponse.json({ error: "interviewId is required" }, { status: 400 });
  }

  // Just the room name — NO App ID prefix here.
  // The App ID is added automatically by the frontend components.
  const roomName = `kayod-interview-${interviewId}`;
  const roomUrl = `https://8x8.vc/${JAAS_APP_ID}/${roomName}`;

  const scheduled = scheduledAt ? new Date(scheduledAt) : new Date();
  const notBeforeAt = new Date(scheduled.getTime() - 15 * 60 * 1000);
  const expiresAt = new Date(scheduled.getTime() + 2 * 60 * 60 * 1000);

  try {
    const { error: updateError } = await supabase
      .from("interviews")
      .update({
        video_room_url: roomUrl,
        video_room_name: roomName,        // plain room name, no App ID prefix
        video_provider: "jaas",           // updated from "jitsi" to "jaas"
        room_not_before: notBeforeAt.toISOString(),
        room_expires_at: expiresAt.toISOString(),
      })
      .eq("id", interviewId);

    if (updateError) {
      console.error("Supabase update error:", updateError);
    }

    return NextResponse.json({
      roomName,
      roomUrl,
      notBeforeAt: notBeforeAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("JaaS room creation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}