// app/api/interviews/jitsi-room/route.ts
// Generates a Jitsi Meet room URL for an online interview.
// No external API key required — Jitsi Meet is free and open-source.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const JITSI_SERVER = process.env.JITSI_SERVER ?? "meet.jit.si";

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

  const roomName = `kayod-interview-${interviewId}`;
  const roomUrl = `https://${JITSI_SERVER}/${roomName}`;

  const scheduled = scheduledAt ? new Date(scheduledAt) : new Date();
  const notBeforeAt = new Date(scheduled.getTime() - 15 * 60 * 1000);
  const expiresAt = new Date(scheduled.getTime() + 2 * 60 * 60 * 1000);

  try {
    const { error: updateError } = await supabase
      .from("interviews")
      .update({
        video_room_url: roomUrl,
        video_room_name: roomName,
        video_provider: "jitsi",
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
    console.error("Jitsi room creation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}