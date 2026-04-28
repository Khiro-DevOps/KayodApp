import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/contracts/submit-signature
 * Candidate submits digital signature on contract
 *
 * Body: {
 *   contractId: string;
 *   signatureBase64: string (from canvas);
 *   candidateName: string;
 * }
 * Requires: Candidate role, must own the contract
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

    const { contractId, signatureBase64, candidateName } = await req.json();

    if (!contractId || !signatureBase64 || !candidateName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get contract
    const { data: contract } = await supabase
      .from("contracts")
      .select("id, job_offer_proposal_id, contract_status")
      .eq("id", contractId)
      .single();

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Verify candidate owns this contract
    const { data: proposal } = await supabase
      .from("job_offer_proposals")
      .select("application_id")
      .eq("id", contract.job_offer_proposal_id)
      .single();

    const { data: application } = await supabase
      .from("applications")
      .select("candidate_id")
      .eq("id", proposal?.application_id)
      .single();

    if (application?.candidate_id !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to sign this contract" },
        { status: 403 }
      );
    }

    // Update contract with signature
    const { error: updateError } = await supabase
      .from("contracts")
      .update({
        contract_status: "signed",
        candidate_signature: signatureBase64,
        candidate_signed_name: candidateName,
        signature_timestamp: new Date().toISOString(),
        signed_at: new Date().toISOString(),
      })
      .eq("id", contractId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update contract: " + updateError.message },
        { status: 500 }
      );
    }

    // Notification will be auto-triggered by database trigger which updates application status

    return NextResponse.json(
      {
        success: true,
        message: "Contract signed successfully",
        signedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Contract signature error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
