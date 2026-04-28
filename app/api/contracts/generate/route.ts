import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/contracts/generate
 * HR generates a contract from template with JO proposal data
 *
 * Body: {
 *   jobOfferProposalId: string;
 *   contractTemplateId: string;
 *   customEdits?: string (HTML);
 *   sendToCandidateNow?: boolean;
 * }
 * Requires: HR or Admin role
 *
 * Returns: { success: true, contract: Contract }
 * Note: PDF generation happens separately via /api/contracts/render-pdf
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
        { error: "Only HR can generate contracts" },
        { status: 403 }
      );
    }

    const {
      jobOfferProposalId,
      contractTemplateId,
      customEdits,
      sendToCandidateNow = false,
    } = await req.json();

    if (!jobOfferProposalId || !contractTemplateId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get job offer proposal
    const { data: proposal } = await supabase
      .from("job_offer_proposals")
      .select(
        `
        id,
        application_id,
        base_salary,
        start_date,
        position_title,
        benefits_summary,
        other_terms
      `
      )
      .eq("id", jobOfferProposalId)
      .single();

    if (!proposal) {
      return NextResponse.json(
        { error: "Job offer proposal not found" },
        { status: 404 }
      );
    }

    // Get contract template
    const { data: template } = await supabase
      .from("contract_templates")
      .select("id, html_template, name")
      .eq("id", contractTemplateId)
      .single();

    if (!template) {
      return NextResponse.json(
        { error: "Contract template not found" },
        { status: 404 }
      );
    }

    // Get candidate info for signature date
    const { data: application } = await supabase
      .from("applications")
      .select("candidate_id")
      .eq("id", proposal.application_id)
      .single();

    const { data: candidate } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", application?.candidate_id)
      .single();

    // Prepare template variables
    const formatSalary = (salary: number) => {
      return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
      }).format(salary);
    };

    const today = new Date();
    const formatDate = (date: Date) => {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    // Replace template placeholders
    let contractHtml = template.html_template;
    contractHtml = contractHtml.replace(
      /\{\{candidateName\}\}/g,
      `${candidate?.first_name} ${candidate?.last_name}`
    );
    contractHtml = contractHtml.replace(
      /\{\{positionTitle\}\}/g,
      proposal.position_title
    );
    contractHtml = contractHtml.replace(/\{\{baseSalary\}\}/g, formatSalary(proposal.base_salary));
    contractHtml = contractHtml.replace(
      /\{\{startDate\}\}/g,
      new Date(proposal.start_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    );
    contractHtml = contractHtml.replace(
      /\{\{benefitsSummary\}\}/g,
      proposal.benefits_summary || "As per company policy"
    );
    contractHtml = contractHtml.replace(
      /\{\{otherTerms\}\}/g,
      proposal.other_terms && typeof proposal.other_terms === "object"
        ? JSON.stringify(proposal.other_terms)
            .replace(/[{}":,]/g, " ")
            .trim()
        : ""
    );
    contractHtml = contractHtml.replace(
      /\{\{signDate\}\}/g,
      formatDate(today)
    );
    contractHtml = contractHtml.replace(
      /\{\{signatureDate\}\}/g,
      formatDate(today)
    );

    // Apply custom edits if provided
    if (customEdits) {
      contractHtml = customEdits;
    }

    // Check for existing contract version
    const { data: existingContracts } = await supabase
      .from("contracts")
      .select("version_number")
      .eq("job_offer_proposal_id", jobOfferProposalId)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVersion = (existingContracts?.[0]?.version_number || 0) + 1;
    const previousContract =
      nextVersion > 1
        ? existingContracts?.find((c) => c.version_number === nextVersion - 1)
        : null;

    // Create contract record
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .insert({
        job_offer_proposal_id: jobOfferProposalId,
        contract_template_id: contractTemplateId,
        version_number: nextVersion,
        supersedes_contract_id: previousContract?.id || null,
        contract_status: sendToCandidateNow
          ? "sent_to_candidate"
          : "draft",
        contract_html: contractHtml,
        pdf_url: null, // Will be generated asynchronously
        sent_at: sendToCandidateNow ? new Date().toISOString() : null,
      })
      .select();

    if (contractError) {
      return NextResponse.json(
        { error: "Failed to create contract: " + contractError.message },
        { status: 500 }
      );
    }

    // Queue PDF generation (could be done asynchronously via a job queue)
    // For now, just storing the contract
    if (sendToCandidateNow) {
      // Update application status
      await supabase
        .from("applications")
        .update({ status: "contract_sent" })
        .eq("id", proposal.application_id);

      // Notification will be auto-triggered by database trigger
    }

    return NextResponse.json(
      {
        success: true,
        message: `Contract v${nextVersion} generated`,
        contract: contract?.[0],
        contractHtml,
        version: nextVersion,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Contract generation error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
