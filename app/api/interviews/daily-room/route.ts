// app/api/interviews/daily-room/route.ts
// Creates a Daily.co room for an online interview.
// Called by the HR scheduling flow when interview_type = 'online'.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DAILY_API_KEY = process.env.DAILY_API_KEY!;
const DAILY_API_BASE = "https://api.daily.co/v1";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only HR/admin can create rooms
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

  // Generate a unique room name based on interviewId
  const roomName = `kayod-interview-${interviewId}`;

  // Calculate expiry: scheduled time + 2 hours buffer
  const scheduled = scheduledAt ? new Date(scheduledAt) : new Date();
  const expiresAt = Math.floor(scheduled.getTime() / 1000) + 2 * 60 * 60; // +2 hours from scheduled time
  const notBeforeAt = Math.floor(scheduled.getTime() / 1000) - 15 * 60;   // 15 min before

  try {
    const res = await fetch(`${DAILY_API_BASE}/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          exp: expiresAt,
          nbf: notBeforeAt,
          enable_chat: true,
          enable_knocking: true,
          start_video_off: false,
          start_audio_off: false,
          max_participants: 10,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      // Room may already exist — try fetching it
      if (err?.error === "invalid-request-error" && err?.info?.includes("already exists")) {
        const existing = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
          headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
        });
        if (existing.ok) {
          const existingRoom = await existing.json();
          return NextResponse.json({
            roomName: existingRoom.name,
            roomUrl: existingRoom.url,
          });
        }
      }
      console.error("Daily.co error:", err);
      return NextResponse.json({ error: "Failed to create Daily.co room" }, { status: 500 });
    }

    const room = await res.json();

    return NextResponse.json({
      roomName: room.name,
      roomUrl: room.url,
    });
  } catch (err) {
    console.error("Daily.co fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}