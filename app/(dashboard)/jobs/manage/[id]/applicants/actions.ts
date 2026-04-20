"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function scheduleInterviewProposal(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const applicationId = formData.get("application_id") as string;
  const jobId = formData.get("job_id") as string;
  const scheduledAt = formData.get("scheduled_at") as string;
  const notes = formData.get("notes") as string;
  const timezone = formData.get("timezone") as string;
  const interviewTypes = JSON.parse(formData.get("interview_types") as string) as string[];

  if (!applicationId || !jobId || !scheduledAt) {
    return { success: false, error: "Missing required fields" };
  }

  if (interviewTypes.length === 0) {
    return { success: false, error: "Select at least one interview type" };
  }

  try {
    // Fetch application details
    const { data: application } = await supabase
      .from("applications")
      .select("id, candidate_id, job_posting_id")
      .eq("id", applicationId)
      .single();

    if (!application) {
      return { success: false, error: "Application not found" };
    }

    // Check if interview already exists for this application
    const { data: existingInterview } = await supabase
      .from("interviews")
      .select("id")
      .eq("application_id", applicationId)
      .maybeSingle();

    let interviewId: string;

    if (existingInterview) {
      // Update existing interview
      const { data, error } = await supabase
        .from("interviews")
        .update({
          scheduled_at: new Date(scheduledAt).toISOString(),
          timezone,
          interviewer_notes: notes,
          preference_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInterview.id)
        .select("id")
        .single();

      if (error) {
        throw error;
      }
      interviewId = data.id;
    } else {
      // Create new interview
      const { data, error } = await supabase
        .from("interviews")
        .insert({
          application_id: applicationId,
          scheduled_by: user.id,
          scheduled_at: new Date(scheduledAt).toISOString(),
          timezone,
          interview_type: interviewTypes[0], // Default to first option
          status: "scheduled",
          duration_minutes: 60,
          interviewer_notes: notes,
          preference_status: "pending",
        })
        .select("id")
        .single();

      if (error) {
        throw error;
      }
      interviewId = data.id;
    }

    // Store the proposed interview types in a custom field (you might want to create a junction table for this)
    // For now, storing as JSON in interviewer_notes or creating a separate table would be better
    // Let's create an interview_proposals table instead

    // Create interview proposal options
    for (const type of interviewTypes) {
      await supabase
        .from("interview_proposals")
        .upsert(
          {
            interview_id: interviewId,
            interview_type: type,
            created_at: new Date().toISOString(),
          },
          { onConflict: "interview_id,interview_type" }
        );
    }

    // Send notification to candidate
    const { data: app } = await supabase
      .from("applications")
      .select("job_postings(title)")
      .eq("id", applicationId)
      .single();

    const jobTitle = (app?.job_postings as any)?.title || "the position";

    await supabase.from("notifications").insert({
      recipient_id: application.candidate_id,
      type: "interview_scheduled",
      title: "Interview Invitation 🎉",
      body: `You've been invited for an interview for ${jobTitle}. Please respond with your preferred interview format.`,
      action_url: `/interviews/respond/${applicationId}`,
    });

    // Update application status
    await supabase
      .from("applications")
      .update({ status: "interview_scheduled" })
      .eq("id", applicationId);

    revalidatePath(`/jobs/manage/${jobId}/applicants`);
    revalidatePath(`/applications/${applicationId}`);

    return { success: true, interviewId };
  } catch (error) {
    console.error("Interview scheduling error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to schedule interview",
    };
  }
}

export async function submitInterviewPreference(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const applicationId = formData.get("application_id") as string;
  const preferredType = formData.get("preferred_type") as string;

  if (!applicationId || !preferredType) {
    return { success: false, error: "Missing required fields" };
  }

  if (!["online", "in_person"].includes(preferredType)) {
    return { success: false, error: "Invalid interview type" };
  }

  try {
    // Fetch interview for this application
    const { data: interview } = await supabase
      .from("interviews")
      .select("id, application_id")
      .eq("application_id", applicationId)
      .single();

    if (!interview) {
      return { success: false, error: "Interview not found" };
    }

    // Update candidate's preference
    const { error } = await supabase
      .from("interviews")
      .update({
        candidate_interview_type_preference: preferredType,
        preference_submitted_at: new Date().toISOString(),
        preference_status: "submitted",
      })
      .eq("id", interview.id);

    if (error) {
      throw error;
    }

    // Send notification to HR
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const candidateName = profile
      ? `${profile.first_name} ${profile.last_name}`
      : "Candidate";

    await supabase.from("notifications").insert({
      recipient_id: interview.application_id, // This should be HR's ID, need to fix
      type: "application_status_changed",
      title: "Interview Preference Submitted",
      body: `${candidateName} has submitted their interview format preference.`,
      action_url: `/jobs/manage/[id]/applicants/${applicationId}`,
    });

    revalidatePath(`/interviews/respond/${applicationId}`);

    return { success: true };
  } catch (error) {
    console.error("Preference submission error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit preference",
    };
  }
}
