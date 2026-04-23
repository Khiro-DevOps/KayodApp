import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { effectiveRole, isHRRole } from "@/lib/roles";
import type { Profile, Application } from "@/lib/types";
import ApplicationDetailView from "../application-detail-view";

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function deriveNamesFromUser(user: {
  email?: string | null;
  user_metadata?: unknown;
  raw_user_meta_data?: unknown;
}): { firstName: string; lastName: string } {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawMetadata = (user.raw_user_meta_data ?? {}) as Record<string, unknown>;

  const firstName = normalizeName(metadata.first_name ?? rawMetadata.first_name);
  const lastName = normalizeName(metadata.last_name ?? rawMetadata.last_name);
  if (firstName || lastName) {
    return { firstName, lastName };
  }

  const fullName = normalizeName(metadata.full_name ?? rawMetadata.full_name ?? metadata.name ?? rawMetadata.name);
  if (fullName) {
    const [first, ...rest] = fullName.split(/\s+/);
    return {
      firstName: first ?? "",
      lastName: rest.join(" "),
    };
  }

  const handleFallback = normalizeName((user.email ?? "").split("@")[0]).replace(/[._-]+/g, " ").trim();
  return {
    firstName: handleFallback || "User",
    lastName: "",
  };
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);

  // Fetch application with all related data
  const { data: application } = await supabase
    .from("applications")
    .select(`
      id,
      job_posting_id,
      candidate_id,
      resume_id,
      status,
      cover_letter,
      match_score,
      hr_notes,
      hr_offered_modes,
      hr_office_address,
      selected_mode,
      selected_mode_set_at,
      submitted_at,
      updated_at,
      profiles ( id, first_name, last_name, email, phone, avatar_url, city, country ),
      resumes ( id, title, pdf_url, content_text ),
      job_postings ( id, title, location, description, salary_min, salary_max, currency, employment_type )
    `)
    .eq("id", id)
    .single<Application>();

  if (!application) {
    redirect("/applications");
  }

  // Repair candidate profile names from auth metadata when stale/missing.
  try {
    const admin = getAdminClient();
    const candidateId = application.candidate_id;
    const candidateProfile = (application.profiles ?? {}) as {
      first_name?: string | null;
      last_name?: string | null;
    };

    const { data: authData } = await admin.auth.admin.getUserById(candidateId);
    const authUser = authData?.user;

    if (authUser) {
      const { firstName, lastName } = deriveNamesFromUser(authUser);
      const currentFirst = normalizeName(candidateProfile.first_name);
      const currentLast = normalizeName(candidateProfile.last_name);

      if ((firstName || lastName) && (currentFirst !== firstName || currentLast !== lastName)) {
        await admin
          .from("profiles")
          .update({ first_name: firstName, last_name: lastName })
          .eq("id", candidateId);

        (application.profiles as { first_name?: string; last_name?: string }).first_name = firstName;
        (application.profiles as { first_name?: string; last_name?: string }).last_name = lastName;
      }
    }
  } catch {
    // Non-blocking: keep page working even if admin sync is unavailable.
  }

  // Access control: HR can view any application, candidates can only view their own
  if (!isHR && application.candidate_id !== user.id) {
    redirect("/applications");
  }

  // Fetch interviews for this application
  const { data: interviews } = await supabase
    .from("interviews")
    .select(`
      id,
      application_id,
      scheduled_by,
      status,
      interview_type,
      available_modes,
      location_details,
      applicant_selection,
      scheduled_at,
      duration_minutes,
      timezone,
      location_address,
      location_notes,
      video_room_url,
      video_room_name,
      video_provider,
      interviewer_notes,
      interview_score,
      created_at,
      updated_at,
      profiles ( first_name, last_name, email )
    `)
    .eq("application_id", id)
    .order("scheduled_at", { ascending: false });

  return (
    <PageContainer>
      <ApplicationDetailView
        application={application}
        interviews={interviews ?? []}
        userRole={role}
        isCurrentUser={!isHR}
      />
    </PageContainer>
  );
}
