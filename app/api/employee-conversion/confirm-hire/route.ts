import { createClient } from "@/lib/supabase/server";
import { sendNotification } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/employee-conversion/confirm-hire
 * HR confirms contract signed → Convert applicant to employee
 *
 * Body: { applicationId: string, employeeStartDate?: string }
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
        { error: "Only HR can confirm hires" },
        { status: 403 }
      );
    }

    const { applicationId, employeeStartDate } = await req.json();

    if (!applicationId) {
      return NextResponse.json(
        { error: "applicationId is required" },
        { status: 400 }
      );
    }

    // Get application and candidate info
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select(
        `
        id,
        candidate_id,
        job_posting_id,
        status
      `
      )
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Get job posting info
    const { data: jobPosting } = await supabase
      .from("job_postings")
      .select("id, title")
      .eq("id", application.job_posting_id)
      .single();

    // Get candidate profile
    const { data: candidate } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .eq("id", application.candidate_id)
      .single();

    // Get contract's start date (use as employee start date if not provided)
    let startDate = employeeStartDate;
    if (!startDate) {
      const { data: contract } = await supabase
        .from("contracts")
        .select("job_offer_proposal_id")
        .eq("job_offer_proposal_id", application.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (contract) {
        const { data: proposal } = await supabase
          .from("job_offer_proposals")
          .select("start_date")
          .eq("id", contract.job_offer_proposal_id)
          .single();

        if (proposal) {
          startDate = proposal.start_date;
        }
      }
    }

    // Step 1: Update user role in Supabase Auth (requires service role)
    // This is a workaround—in production, use Admin API
    // For now, we'll update the profiles table role directly
    const { error: roleError } = await supabase
      .from("profiles")
      .update({ role: "employee" })
      .eq("id", application.candidate_id);

    if (roleError) {
      return NextResponse.json(
        { error: "Failed to update user role: " + roleError.message },
        { status: 500 }
      );
    }

    // Step 2: Create employee record
    const employeeNumber = `EMP-${Date.now()}`;
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .insert({
        profile_id: application.candidate_id,
        application_id: applicationId,
        employee_number: employeeNumber,
        job_title: jobPosting?.title || "Employee",
        employment_type: "full-time",
        employment_status: "active",
        start_date: startDate || new Date().toISOString().split("T")[0],
        base_salary: 0, // Will be set separately
        pay_frequency: "monthly",
        currency: "PHP",
      })
      .select();

    if (empError) {
      return NextResponse.json(
        { error: "Failed to create employee record: " + empError.message },
        { status: 500 }
      );
    }

    // Step 3: Update application status to onboarded
    const { error: appUpdateError } = await supabase
      .from("applications")
      .update({
        status: "onboarded",
        onboarding_confirmed_at: new Date().toISOString(),
        onboarding_confirmed_by: user.id,
      })
      .eq("id", applicationId);

    if (appUpdateError) {
      return NextResponse.json(
        { error: "Failed to update application: " + appUpdateError.message },
        { status: 500 }
      );
    }

    // Step 4: Send notification to candidate
    await sendNotification({
      supabase,
      recipientId: application.candidate_id,
      type: "general",
      title: "Welcome to the Team! 🎉",
      body: `Your employment contract has been confirmed. You are now officially an employee. Your start date is ${startDate || new Date().toLocaleDateString()}.`,
      actionUrl: "/dashboard/onboarding/welcome",
      sendPush: true,
    });

    // Step 5: Send notification to HR
    await sendNotification({
      supabase,
      recipientId: user.id,
      type: "general",
      title: "Hire Confirmed",
      body: `${candidate?.first_name} ${candidate?.last_name} has been converted to employee. Employee ID: ${employeeNumber}`,
      actionUrl: `/applications/${applicationId}`,
      sendPush: true,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Candidate converted to employee",
        employeeId: employee?.[0]?.id,
        employeeNumber,
        redirectTo: "/dashboard/onboarding/welcome",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Employee conversion error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
