import { createClient } from "@/lib/supabase/server";
import { sendNotification } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/job-offers/send
 * HR sends job offer to candidate
 *
 * Body: { jobOfferProposalId: string }
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
        { error: "Only HR can send job offers" },
        { status: 403 }
      );
    }

    const { jobOfferProposalId } = await req.json();

    if (!jobOfferProposalId) {
      return NextResponse.json(
        { error: "jobOfferProposalId is required" },
        { status: 400 }
      );
    }

    // Get proposal and application
    const { data: proposal } = await supabase
      .from("job_offer_proposals")
      .select("id, application_id, base_salary, start_date, position_title")
      .eq("id", jobOfferProposalId)
      .single();

    if (!proposal) {
      return NextResponse.json(
        { error: "Job offer not found" },
        { status: 404 }
      );
    }

    // Get candidate info
    const { data: application } = await supabase
      .from("applications")
      .select("candidate_id")
      .eq("id", proposal.application_id)
      .single();

    // Update proposal status to sent_to_candidate
    const { error: updateError } = await supabase
      .from("job_offer_proposals")
      .update({
        proposal_status: "sent_to_candidate",
        sent_at: new Date().toISOString(),
      })
      .eq("id", jobOfferProposalId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update offer: " + updateError.message },
        { status: 500 }
      );
    }

    // Notification will be auto-triggered by database trigger

    return NextResponse.json(
      {
        success: true,
        message: "Job offer sent to candidate",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Job offer send error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
