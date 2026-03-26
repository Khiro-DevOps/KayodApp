"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { computeMatchScore } from "@/lib/match-score";

export async function submitApplication(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobListingId = formData.get("job_listing_id") as string;
  const resumeId = formData.get("resume_id") as string | null;

  if (!jobListingId) {
    redirect("/jobs");
  }

  // Verify user is a job seeker
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "job_seeker") redirect("/dashboard");

  // Check if already applied
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("job_listing_id", jobListingId)
    .maybeSingle();

  if (existing) {
    redirect(`/jobs/${jobListingId}?error=${encodeURIComponent("You have already applied to this job.")}`);
  }

  // Compute match score if resume has extracted text
  let matchScore: number | null = null;

  if (resumeId) {
    const { data: resume } = await supabase
      .from("resumes")
      .select("extracted_text")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .single();

    if (resume?.extracted_text) {
      const { data: job } = await supabase
        .from("job_listings")
        .select("title, description, requirements, skills")
        .eq("id", jobListingId)
        .single();

      if (job) {
        matchScore = computeMatchScore(resume.extracted_text, job);
      }
    }
  }

  // Fetch the job title for notification message
  const { data: jobForNotif } = await supabase
    .from("job_listings")
    .select("title")
    .eq("id", jobListingId)
    .single();

  // Submit application
  const { data: newApp, error } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      job_listing_id: jobListingId,
      resume_id: resumeId || null,
      match_score: matchScore,
      status: "applied",
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/jobs/${jobListingId}/apply?error=${encodeURIComponent(error.message)}`);
  }

  // Create notification for applicant
  if (newApp) {
    await supabase.from("notifications").insert({
      user_id: user.id,
      message: `Your application for "${jobForNotif?.title || "a job"}" has been submitted.`,
      type: "apply",
      related_application_id: newApp.id,
    });
  }

  revalidatePath("/applications");
  revalidatePath("/notifications");
  revalidatePath(`/jobs/${jobListingId}`);
  revalidatePath("/dashboard");
  redirect(`/applications?success=${encodeURIComponent("Application submitted successfully!")}`);
}

export async function withdrawApplication(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  if (!applicationId) redirect("/applications");

  // Only allow withdrawal of own applications in "applied" status
  const { data: application } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .eq("user_id", user.id)
    .single();

  if (!application || application.status !== "applied") {
    redirect("/applications");
  }

  await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .eq("user_id", user.id);

  revalidatePath("/applications");
  revalidatePath("/dashboard");
  redirect("/applications");
}

export async function updateApplicationStatus(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  const status = formData.get("status") as string;
  const jobId = formData.get("job_id") as string;

  if (!applicationId || !status) redirect("/jobs/manage");

  // Verify the employer owns the job
  const { data: employer } = await supabase
    .from("employers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!employer) redirect("/dashboard");

  const validStatuses = ["applied", "shortlisted", "interview", "hired"];
  if (!validStatuses.includes(status)) redirect("/jobs/manage");

  const { error } = await supabase
    .from("applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (error) {
    redirect(`/jobs/manage/${jobId}/applicants?error=${encodeURIComponent(error.message)}`);
  }

  // Send notification to the applicant
  const { data: appData } = await supabase
    .from("applications")
    .select("user_id, job_listings(title)")
    .eq("id", applicationId)
    .single();

  if (appData) {
    const jobTitle =
      (appData.job_listings as unknown as { title: string })?.title || "a job";
    const notifTypeMap: Record<string, { type: string; message: string }> = {
      shortlisted: {
        type: "shortlist",
        message: `You've been shortlisted for "${jobTitle}"!`,
      },
      interview: {
        type: "interview",
        message: `You've been scheduled for an interview for "${jobTitle}"!`,
      },
      hired: {
        type: "hire",
        message: `Congratulations! You've been hired for "${jobTitle}"!`,
      },
    };

    const notif = notifTypeMap[status];
    if (notif) {
      await supabase.from("notifications").insert({
        user_id: appData.user_id,
        message: notif.message,
        type: notif.type,
        related_application_id: applicationId,
      });
    }
  }

  // Auto-create interview record when status moves to "interview"
  if (status === "interview") {
    const { data: existingInterview } = await supabase
      .from("interviews")
      .select("id")
      .eq("application_id", applicationId)
      .maybeSingle();

    if (!existingInterview) {
      // Default to 3 days from now at 10:00 AM
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 3);
      defaultDate.setHours(10, 0, 0, 0);

      await supabase.from("interviews").insert({
        application_id: applicationId,
        scheduled_at: defaultDate.toISOString(),
        notes: null,
      });
    }
  }

  // Auto-create employee record when status moves to "hired"
  if (status === "hired") {
    const { data: application } = await supabase
      .from("applications")
      .select("user_id, job_listing_id, job_listings(title), profiles(full_name)")
      .eq("id", applicationId)
      .single();

    if (application) {
      const fullName =
        (application.profiles as unknown as { full_name: string })?.full_name ||
        "New Employee";
      const jobTitle =
        (application.job_listings as unknown as { title: string })?.title ||
        "Employee";

      const { data: existingEmployee } = await supabase
        .from("employees")
        .select("id")
        .eq("application_id", applicationId)
        .maybeSingle();

      if (!existingEmployee) {
        await supabase.from("employees").insert({
          employer_id: employer.id,
          application_id: applicationId,
          full_name: fullName,
          job_title: jobTitle,
          start_date: new Date().toISOString().split("T")[0],
          status: "active",
        });
      }
    }
  }

  revalidatePath(`/jobs/manage/${jobId}/applicants`);
  revalidatePath("/applications");
  revalidatePath("/notifications");
  revalidatePath("/employees");
  revalidatePath("/dashboard");
  redirect(`/jobs/manage/${jobId}/applicants`);
}

export async function scheduleInterview(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  const scheduledAt = formData.get("scheduled_at") as string;
  const notes = formData.get("notes") as string | null;
  const jobId = formData.get("job_id") as string;

  if (!applicationId || !scheduledAt || !jobId) redirect("/jobs/manage");

  // Verify employer owns the job
  const { data: employer } = await supabase
    .from("employers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!employer) redirect("/dashboard");

  // Check if interview exists, then insert or update
  const { data: existingInterview } = await supabase
    .from("interviews")
    .select("id")
    .eq("application_id", applicationId)
    .maybeSingle();

  let error;

  if (existingInterview) {
    ({ error } = await supabase
      .from("interviews")
      .update({
        scheduled_at: new Date(scheduledAt).toISOString(),
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingInterview.id));
  } else {
    ({ error } = await supabase.from("interviews").insert({
      application_id: applicationId,
      scheduled_at: new Date(scheduledAt).toISOString(),
      notes: notes || null,
    }));
  }

  if (error) {
    redirect(
      `/jobs/manage/${jobId}/applicants/${applicationId}/interview?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/jobs/manage/${jobId}/applicants`);
  revalidatePath("/applications");
  redirect(`/jobs/manage/${jobId}/applicants`);
}
