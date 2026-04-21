// app/api/interviews/set-preference/route.ts
// Called when a job seeker selects online or in-person interview preference.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const applicationId = payload.applicationId as string | undefined;
  const preference = (payload.selectedMode ?? payload.preference) as string | undefined;
  const isValidPreference = preference === "online" || preference === "in_person";

  if (!applicationId || !isValidPreference) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Verify the application belongs to this user
  const { data: app } = await supabase
    .from("applications")
    .select("id, candidate_id, status, hr_offered_modes")
    .eq("id", applicationId)
    .single();

  if (!app || app.candidate_id !== user.id) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Only allow setting preference if qualified / shortlisted
  const allowedStatuses = ["shortlisted", "interview_scheduled", "under_review"];
  if (!allowedStatuses.includes(app.status)) {
    return NextResponse.json({ error: "Application not eligible" }, { status: 400 });
  }

  const allowedModes = (app.hr_offered_modes ?? []) as string[];
  if (allowedModes.length > 0 && !allowedModes.includes(preference)) {
    return NextResponse.json({ error: "Selected mode is not available" }, { status: 400 });
  }

  // Save the preference via security-definer RPC to avoid broad candidate UPDATE policy.
  const { error } = await supabase.rpc("set_application_interview_preference", {
    p_application_id: applicationId,
    p_preference: preference,
  });

  if (error) {
    console.error("set-preference error:", error);
    const errMsg = (error.message ?? "").toLowerCase();
    if (errMsg.includes("not eligible")) {
      return NextResponse.json({ error: "Application not eligible" }, { status: 400 });
    }
    if (errMsg.includes("not found")) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    if (errMsg.includes("not allowed")) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to save preference" }, { status: 500 });
  }

  // Send notification to HR that candidate set preference
  // Find HR who created the job posting
  const { data: appWithJob } = await supabase
    .from("applications")
    .select(`
      candidate_id,
      job_postings ( created_by, title )
    `)
    .eq("id", applicationId)
    .single();

  const posting = (appWithJob?.job_postings as { created_by: string; title: string }[] | null)?.[0];
  const hrId = posting?.created_by;
  const jobTitle = posting?.title ?? "a position";

  if (hrId) {
    const { data: candidateProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const candidateName = candidateProfile
      ? `${candidateProfile.first_name} ${candidateProfile.last_name}`
      : "A candidate";

    const preferenceLabel = preference === "online" ? "Online" : "In-Person";

    await supabase.from("notifications").insert({
      recipient_id: hrId,
      type: "application_status_changed",
      title: `Interview Preference Set`,
      body: `${candidateName} has chosen ${preferenceLabel} for the ${jobTitle} interview. You can now schedule the interview.`,
      action_url: `/applications/${applicationId}`,
    });
  }

  return NextResponse.json({ success: true });
}