"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function updateApplicationStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["hr_manager", "admin"].includes(profile.role)) redirect("/dashboard");

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

  const { error } = await supabase
    .from("job_applications") // <--- MUST be job_applications
    .update({ status: dbStatus })
    .eq("id", applicationId)
    .select();

  if (error) {
    console.error("KANBAN UPDATE FAILED:", error);
    throw new Error(error.message);
  }

  const { data: appData } = await supabase
    .from("job_applications")
    .select("applicant_id, job:job_postings(title)")
    .eq("id", applicationId)
    .single();

  if (appData) {
    const jobTitle = (appData.job as unknown as { title: string } | null)?.title ?? "the position";

    await supabase.from("notifications").insert({
      recipient_id: appData.applicant_id,
      title: "Application Stage Updated",
      body: `Your application for ${jobTitle} moved to ${dbStatus}.`,
      type: "application_status_changed",
      is_read: false,
      created_at: new Date().toISOString(),
    });
  }

  // When shortlisted: notify candidate to choose interview format
  if (normalizedStatus === "shortlisted") {
    const { data: app } = await supabase
      .from("job_applications")
      .select("applicant_id, job:job_postings(title)")
      .eq("id", applicationId)
      .single();

    if (app) {
      const jobTitle = (app.job as unknown as { title: string })?.title ?? "a position";

      // Mark when HR qualified this applicant
      await supabase
        .from("job_applications")
        .update({ interview_qualified_at: new Date().toISOString() })
        .eq("id", applicationId);

      // Send notification to candidate
      await supabase.from("notifications").insert({
        recipient_id: app.applicant_id,
        type: "application_status_changed",
        title: "You've been shortlisted! 🎉",
        body: `Congratulations! You've been selected for an interview for ${jobTitle}. Please choose your preferred interview format.`,
        action_url: `/interviews/respond/${applicationId}`,
      });
    }
  }

  // Auto-create employee when hired
  if (dbStatus === "hired") {
    const { data: app } = await supabase
      .from("job_applications")
      .select("applicant_id, job:job_postings(title)")
      .eq("id", applicationId)
      .single();

    if (app) {
      const { data: existing } = await supabase
        .from("employees")
        .select("id")
        .eq("profile_id", app.applicant_id)
        .maybeSingle();

      if (!existing) {
        const jobTitle = (app.job as unknown as { title: string })?.title ?? "Employee";
        await supabase.from("employees").insert({
          profile_id:        app.applicant_id,
          application_id:    applicationId,
          job_title:         jobTitle,
          start_date:        new Date().toISOString().split("T")[0],
          base_salary:       0,
          employment_status: "active",
          employment_type:   "full_time",
          pay_frequency:     "monthly",
        });
        // Update profile role to employee
        await supabase
          .from("profiles")
          .update({ role: "employee" })
          .eq("id", app.applicant_id);
      }
    }
  }

  revalidatePath("/applications");
  revalidatePath("/employees");
  revalidatePath("/dashboard");
}

export async function moveToApplied(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["hr_manager", "admin"].includes(profile.role)) redirect("/dashboard");

  const applicationId = formData.get("application_id") as string;
  if (!applicationId) redirect("/applications");

  // Move application to "submitted" status (applied)
  await supabase
    .from("job_applications")
    .update({ 
      status: "submitted",
      updated_at: new Date().toISOString()
    })
    .eq("id", applicationId);

  // Fetch application to send notification
  const { data: app } = await supabase
    .from("job_applications")
    .select("applicant_id, job:job_postings(title)")
    .eq("id", applicationId)
    .single();

  if (app) {
    const jobTitle = (app.job as unknown as { title: string })?.title ?? "a position";
    
    // Send notification to candidate
    await supabase.from("notifications").insert({
      recipient_id: app.applicant_id,
      type: "application_status_changed",
      title: "Your application has been reconsidered",
      body: `Great news! Your application for ${jobTitle} has been moved back to active consideration.`,
      action_url: `/applications`,
    });
  }

  revalidatePath("/applications");
}
