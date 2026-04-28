import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import InterviewNotesForm from "@/components/interviews/interview-notes-form";
import type { Interview } from "@/lib/types";

interface InterviewWithApplication extends Interview {
  applications: {
    candidate_id: string;
    job_postings: { title: string } | null;
    profiles: { first_name: string | null; last_name: string | null } | null;
  } | null;
}

export default async function InterviewNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id: interviewId } = await searchParams;

  if (!interviewId) {
    redirect("/interviews");
  }
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify user is HR
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .single();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";
  if (!isHR) redirect("/interviews");

  // Fetch interview details
  const { data: interview, error: fetchError } = await supabase
    .from("interviews")
    .select(`
      id, status, scheduled_at, duration_minutes,
      interviewer_notes,
      applications (
        candidate_id,
        job_postings ( title ),
        profiles ( first_name, last_name )
      )
    `)
    .eq("id", interviewId)
    .single<InterviewWithApplication>();

  if (fetchError || !interview) {
    return (
      <div className="max-w-md mx-auto space-y-4 pt-8 text-center">
        <p className="text-sm text-text-secondary">Interview not found.</p>
        <Link href="/interviews" className="text-sm text-primary underline underline-offset-2">
          Back to Interviews
        </Link>
      </div>
    );
  }

  const app = interview.applications;
  const candidateName = app?.profiles
    ? `${app.profiles.first_name ?? ""} ${app.profiles.last_name ?? ""}`.trim() || "Candidate"
    : "Candidate";
  const jobTitle = app?.job_postings?.title ?? "Interview";

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/interviews"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </Link>
        <div>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Interview Complete
          </h1>
          <p className="text-sm text-text-secondary">Add or review interview notes for {candidateName}</p>
        </div>
      </div>

      {/* Interview Summary Card */}
      <div className="rounded-2xl bg-surface border border-border p-5 space-y-3">
        <div>
          <p className="text-xs text-text-secondary">Position</p>
          <p className="text-sm font-semibold text-text-primary">{jobTitle}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Candidate</p>
          <p className="text-sm text-text-primary">{candidateName}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">When</p>
          <p className="text-sm text-text-primary">
            {new Date(interview.scheduled_at).toLocaleDateString("en-PH", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* Notes Form */}
      <InterviewNotesForm
        interviewId={interviewId}
        initialNotes={interview.interviewer_notes || ""}
        candidateName={candidateName}
      />
    </div>
  );
}
