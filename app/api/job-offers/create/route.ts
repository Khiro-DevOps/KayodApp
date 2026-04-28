import { createClient } from "@/lib/supabase/server";
import { sendNotification } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/job-offers/create
 * HR creates a job offer proposal (draft)
 *
 * Body: {
 *   applicationId: string;
 *   baseSalary: number;
 *   startDate: string (YYYY-MM-DD);
 *   positionTitle: string;
 *   benefitsSummary?: string;
 *   otherTerms?: Record<string, unknown>;
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
        { error: "Only HR can create job offers" },
        { status: 403 }
      );
    }

    const {
      applicationId,
      baseSalary,
      startDate,
      positionTitle,
      benefitsSummary,
      otherTerms,
    } = await req.json();

    // Validate required fields
    if (!applicationId || !baseSalary || !startDate || !positionTitle) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check application exists
    const { data: application } = await supabase
      .from("applications")
      .select("id, candidate_id, status")
      .eq("id", applicationId)
      .single();

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Create job offer proposal (draft)
    const { data: proposal, error: proposalError } = await supabase
      .from("job_offer_proposals")
      .insert({
        application_id: applicationId,
        created_by: user.id,
        base_salary: baseSalary,
        start_date: startDate,
        position_title: positionTitle,
        benefits_summary: benefitsSummary || null,
        other_terms: otherTerms || {},
        proposal_status: "draft",
      })
      .select();

    if (proposalError) {
      return NextResponse.json(
        { error: "Failed to create offer: " + proposalError.message },
        { status: 500 }
      );
    }

    // Update application status to offer_under_negotiation
    await supabase
      .from("applications")
      .update({ status: "offer_under_negotiation" })
      .eq("id", applicationId);

    return NextResponse.json(
      {
        success: true,
        message: "Job offer created as draft",
        offer: proposal?.[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Job offer creation error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
