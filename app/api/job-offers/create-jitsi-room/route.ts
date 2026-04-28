import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/job-offers/create-jitsi-room
 * HR schedules a job offer negotiation interview and generates Jitsi room
 *
 * Body: {
 *   jobOfferProposalId: string;
 *   interviewType: "online" | "in_person";
 *   scheduledAt: string (ISO 8601);
 *   durationMinutes?: number;
 *   timezone?: string;
 *   location?: { address?: string; notes?: string };
 * }
 * Requires: HR or Admin role
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check HR role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["hr_manager", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only HR can schedule interviews" },
        { status: 403 }
      );
    }

    const {
      jobOfferProposalId,
      interviewType,
      scheduledAt,
      durationMinutes = 60,
      timezone = "Asia/Manila",
      location = {},
    } = await req.json();

    if (!jobOfferProposalId || !interviewType || !scheduledAt) {
      return NextResponse.json(
        {
          error: "Missing required fields: jobOfferProposalId, interviewType, scheduledAt",
        },
        { status: 400 }
      );
    }

    // Validate interview type
    if (!["online", "in_person"].includes(interviewType)) {
      return NextResponse.json(
        { error: "interviewType must be 'online' or 'in_person'" },
        { status: 400 }
      );
    }

    // Check proposal exists
    const { data: proposal } = await supabase
      .from("job_offer_proposals")
      .select("id")
      .eq("id", jobOfferProposalId)
      .single();

    if (!proposal) {
      return NextResponse.json(
        { error: "Job offer proposal not found" },
        { status: 404 }
      );
    }

    let videoRoomUrl = null;
    let videoRoomName = null;

    // Generate Jitsi room for online interviews
    if (interviewType === "online") {
      // Generate unique room name: jo-{proposalId}-{timestamp}
      const roomName = `jo-${jobOfferProposalId.slice(0, 8)}-${Date.now()}`.toLowerCase();
      videoRoomName = roomName;

      // Jitsi URL (configurable via env)
      const jitsiServer = process.env.NEXT_PUBLIC_JITSI_SERVER || "meet.jitsi";
      videoRoomUrl = `https://${jitsiServer}/${roomName}`;
    }

    // Create job offer interview record
    const { data: interview, error: interviewError } = await supabase
      .from("job_offer_interviews")
      .insert({
        job_offer_proposal_id: jobOfferProposalId,
        scheduled_by: user.id,
        interview_type: interviewType,
        status: "scheduled",
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        timezone,
        location_address: location?.address || null,
        location_notes: location?.notes || null,
        video_room_url: videoRoomUrl,
        video_room_name: videoRoomName,
        video_provider: "jitsi",
      })
      .select();

    if (interviewError) {
      return NextResponse.json(
        {
          error: "Failed to create interview: " + interviewError.message,
        },
        { status: 500 }
      );
    }

    // Update application status
    await supabase
      .from("applications")
      .update({ status: "offer_interview_scheduled" })
      .where((q) =>
        q.from("job_offer_proposals").select("application_id").eq("id", jobOfferProposalId)
      );

    // Notification will be auto-triggered by database trigger

    return NextResponse.json(
      {
        success: true,
        message: "Job offer interview scheduled",
        interview: interview?.[0],
        videoRoomUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Jitsi room creation error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
