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

  await supabase
    .from("applications")
    .update({ status })
    .eq("id", applicationId);

  // When shortlisted: notify candidate to choose interview format
  if (status === "shortlisted") {
    const { data: app } = await supabase
      .from("applications")
      .select("candidate_id, job_postings(title)")
      .eq("id", applicationId)
      .single();

    if (app) {
      const jobTitle = (app.job_postings as unknown as { title: string })?.title ?? "a position";

      // Mark when HR qualified this applicant
      await supabase
        .from("applications")
        .update({ interview_qualified_at: new Date().toISOString() })
        .eq("id", applicationId);

      // Send notification to candidate
      await supabase.from("notifications").insert({
        recipient_id: app.candidate_id,
        type: "application_status_changed",
        title: "You've been shortlisted! 🎉",
        body: `Congratulations! You've been selected for an interview for ${jobTitle}. Please choose your preferred interview format.`,
        action_url: `/interviews/respond/${applicationId}`,
      });
    }
  }

  // Auto-create employee when hired
  if (status === "hired") {
    const { data: app } = await supabase
      .from("applications")
      .select("candidate_id, job_postings(title)")
      .eq("id", applicationId)
      .single();

    if (app) {
      const { data: existing } = await supabase
        .from("employees")
        .select("id")
        .eq("profile_id", app.candidate_id)
        .maybeSingle();

      if (!existing) {
        const jobTitle = (app.job_postings as unknown as { title: string })?.title ?? "Employee";
        await supabase.from("employees").insert({
          profile_id:        app.candidate_id,
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
          .eq("id", app.candidate_id);
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
    .from("applications")
    .update({ 
      status: "submitted",
      updated_at: new Date().toISOString()
    })
    .eq("id", applicationId);

  // Fetch application to send notification
  const { data: app } = await supabase
    .from("applications")
    .select("candidate_id, job_postings(title)")
    .eq("id", applicationId)
    .single();

  if (app) {
    const jobTitle = (app.job_postings as unknown as { title: string })?.title ?? "a position";
    
    // Send notification to candidate
    await supabase.from("notifications").insert({
      recipient_id: app.candidate_id,
      type: "application_status_changed",
      title: "Your application has been reconsidered",
      body: `Great news! Your application for ${jobTitle} has been moved back to active consideration.`,
      action_url: `/applications`,
    });
  }

  revalidatePath("/applications");
}
