"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureValidWorkLocationId } from "@/lib/employee-position-server";
import { resolveContractWorkSetup, resolveEmployeeSourceOfTruth } from "@/lib/work-arrangement";

export async function updateApplicationStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["hr_manager", "admin", "hr"].includes(profile.role)) redirect("/dashboard");

  const applicationId = formData.get("application_id") as string;
  const status = formData.get("status") as string;
  if (!applicationId || !status) redirect("/applications");

  const statusMap: Record<string, string> = {
    new: "applied",
    draft: "applied",
    submitted: "applied",
    applied: "applied",
    screening: "screening",
    under_review: "screening",
    shortlisted: "screening",
    interview: "interview",
    interviewing: "interview",
    interview_scheduled: "interview",
    interviewed: "interview",
    offer: "offer",
    negotiating: "offer",
    offer_sent: "offer",
    offer_accepted: "offer",
    offer_declined: "offer",
    offer_expired: "offer",
    pre_employment: "offer",
    hired: "hired",
    hire_confirmed: "hired",
    rejected: "rejected",
    withdrawn: "withdrawn",
  };
  const normalizedStatus = status.toLowerCase();
  const dbStatus = statusMap[normalizedStatus];

  if (!dbStatus) {
    throw new Error(`Unsupported application status: ${status}`);
  }

  const admin = getAdminClient();

  const { data: updatedRows, error } = await admin
    .from("job_applications") // <--- MUST be job_applications
    .update({ status: dbStatus, updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .select("id");

  if (error || !updatedRows || updatedRows.length === 0) {
    console.error("KANBAN UPDATE FAILED:", error?.message ?? "No matching application row");
    throw new Error(error?.message ?? "Application not found");
  }

  const { data: appData } = await admin
    .from("job_applications")
    .select("applicant_id, job:job_postings(title)")
    .eq("id", applicationId)
    .single();

  if (appData) {
    const jobTitle = (appData.job as unknown as { title: string } | null)?.title ?? "the position";

    const { error: notifError } = await admin.from("notifications").insert({
      recipient_id: appData.applicant_id,
      title: "Application Stage Updated",
      body: `Your application for ${jobTitle} moved to ${dbStatus}.`,
      type: "application_status_changed",
      is_read: false,
      created_at: new Date().toISOString(),
    });
    if (notifError) {
      console.error("updateApplicationStatus: notification insert failed:", notifError.message);
    }
  }

  // When shortlisted: notify candidate to choose interview format
  if (normalizedStatus === "shortlisted") {
    const { data: app } = await admin
      .from("job_applications")
      .select("applicant_id, job:job_postings(title)")
      .eq("id", applicationId)
      .single();

    if (app) {
      const jobTitle = (app.job as unknown as { title: string })?.title ?? "a position";

      // Mark when HR qualified this applicant
      await admin
        .from("job_applications")
        .update({ interview_qualified_at: new Date().toISOString() })
        .eq("id", applicationId);

      // Send notification to candidate
      const { error: shortlistNotifError } = await admin.from("notifications").insert({
        recipient_id: app.applicant_id,
        type: "application_status_changed",
        title: "You've been shortlisted! 🎉",
        body: `Congratulations! You've been selected for an interview for ${jobTitle}. Please choose your preferred interview format.`,
        action_url: `/hr/interviews/respond/${applicationId}`,
      });
      if (shortlistNotifError) {
        console.error("updateApplicationStatus: shortlist notification insert failed:", shortlistNotifError.message);
      }
    }
  }

  // Auto-create employee when hired
  if (dbStatus === "hired") {
    const admin = getAdminClient();
    const { data: app } = await admin
      .from("job_applications")
      .select("applicant_id, job:job_postings(title, department_id, work_setup)")
      .eq("id", applicationId)
      .single();

    if (app) {
      const { data: latestOffer } = await admin
        .from("job_offers")
        .select("work_setup, work_mode, work_location_id, job_metadata")
        .eq("application_id", applicationId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: existing } = await admin
        .from("employees")
        .select("id")
        .eq("profile_id", app.applicant_id)
        .maybeSingle();

      if (!existing) {
        const job = app.job as unknown as {
          title?: string | null;
          department_id?: string | null;
          work_setup?: string | null;
          work_location_id?: string | null;
        } | null;
        const resolved = resolveEmployeeSourceOfTruth({
          offer: latestOffer
            ? {
                job_title: (latestOffer.job_metadata as { job_title?: string } | null)?.job_title ?? null,
                work_setup: latestOffer.work_setup ?? latestOffer.work_mode,
              }
            : null,
          jobPosting: job,
        });
        const workMode = resolveContractWorkSetup({
          offerWorkSetup: latestOffer?.work_setup ?? latestOffer?.work_mode,
          jobWorkSetup: job?.work_setup,
        });
        const validWorkLocationId = await ensureValidWorkLocationId(
          latestOffer?.work_location_id ?? null,
        );
        await admin.from("employees").insert({
          profile_id:        app.applicant_id,
          application_id:    applicationId,
          department_id:     job?.department_id ?? null,
          job_title:         resolved.position,
          work_mode:         workMode,
          work_location_id:  validWorkLocationId,
          start_date:        new Date().toISOString().split("T")[0],
          base_salary:       0,
          employment_status: "active",
          employment_type:   "full_time",
          pay_frequency:     "monthly",
        });
        // Update profile role to employee
        await admin
          .from("profiles")
          .update({ role: "employee" })
          .eq("id", app.applicant_id);
      }
    }
  }

  revalidatePath("/applications");
  revalidatePath("/hr/applicants");
  revalidatePath("/hr", "layout");
  revalidatePath("/applicant/applications");
  revalidatePath("/employees");
  revalidatePath("/dashboard");
}

export async function moveToApplied(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["hr_manager", "admin", "hr"].includes(profile.role)) redirect("/dashboard");

  const applicationId = formData.get("application_id") as string;
  if (!applicationId) redirect("/applications");

  // Move application to "submitted" status (applied)
  const { error: moveError } = await supabase
    .from("job_applications")
    .update({ 
      status: "submitted",
      updated_at: new Date().toISOString()
    })
    .eq("id", applicationId);

  if (moveError) {
    console.error("moveToApplied: update failed:", moveError.message);
  }

  // Fetch application to send notification
  const { data: app } = await supabase
    .from("job_applications")
    .select("applicant_id, job:job_postings(title)")
    .eq("id", applicationId)
    .single();

  if (app && !moveError) {
    const jobTitle = (app.job as unknown as { title: string })?.title ?? "a position";
    
    // Send notification to candidate
    const { error: notifError } = await getAdminClient().from("notifications").insert({
      recipient_id: app.applicant_id,
      type: "application_status_changed",
      title: "Your application has been reconsidered",
      body: `Great news! Your application for ${jobTitle} has been moved back to active consideration.`,
      action_url: "/applicant/applications",
    });
    if (notifError) {
      console.error("moveToApplied: notification insert failed:", notifError.message);
    }
  }

  revalidatePath("/applications");
  revalidatePath("/hr/applicants");
}
