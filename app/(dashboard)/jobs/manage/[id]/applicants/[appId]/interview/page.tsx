import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import { scheduleInterview } from "@/app/(dashboard)/interviews/actions";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ id: string; appId: string }>;
}) {
  const { id, appId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify employer owns this job
  const { data: employer } = await supabase
    .from("employers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!employer) redirect("/dashboard");

  const { data: job } = await supabase
    .from("job_postings")
    .select("id, title, created_by")
    .eq("id", id)
    .single();

  if (!job || job.created_by !== employer.id) notFound();

  // Fetch the application with applicant info
  const { data: application } = await supabase
    .from("applications")
    .select("id, status, candidate_id, job_posting_id, profiles(first_name, last_name, email)")
    .eq("id", appId)
    .eq("job_posting_id", id)
    .single();

  if (!application) notFound();

  // Fetch existing interview
  const { data: interview } = await supabase
    .from("interviews")
    .select("*")
    .eq("application_id", appId)
    .maybeSingle();

  const applicant = application.profiles as unknown as {
    full_name: string;
    email: string;
  } | null;

  // Format date for datetime-local input
  const formatForInput = (isoString: string) => {
    const d = new Date(isoString);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const defaultDate = interview
    ? formatForInput(interview.scheduled_at)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        d.setHours(10, 0, 0, 0);
        return formatForInput(d.toISOString());
      })();

  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/jobs/manage/${id}/applicants`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
              {interview ? "Edit Interview" : "Schedule Interview"}
            </h1>
            <p className="text-xs text-text-secondary truncate">{job.title}</p>
          </div>
        </div>

        {/* Applicant Info */}
        <div className="rounded-2xl bg-surface border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
              {applicant?.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {applicant?.full_name || "Unknown"}
              </p>
              <p className="text-xs text-text-secondary truncate">
                {applicant?.email || ""}
              </p>
            </div>
          </div>
        </div>

        {/* Schedule Form */}
        <form action={scheduleInterview} className="space-y-4">
          <input type="hidden" name="application_id" value={appId} />
          <input type="hidden" name="job_id" value={id} />
          <input type="hidden" name="interview_type" value="online" />

          <div>
            <label
              htmlFor="scheduled_at"
              className="mb-1.5 block text-sm font-medium text-text-primary"
            >
              Date & Time
            </label>
            <input
              type="datetime-local"
              id="scheduled_at"
              name="scheduled_at"
              defaultValue={defaultDate}
              required
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label
              htmlFor="location_notes"
              className="mb-1.5 block text-sm font-medium text-text-primary"
            >
              Notes (optional)
            </label>
            <textarea
              id="location_notes"
              name="location_notes"
              rows={4}
              defaultValue={interview?.notes || ""}
              placeholder="Interview location, video call link, topics to discuss..."
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            {interview ? "Update Interview" : "Schedule Interview"}
          </button>
        </form>
      </div>
    </PageContainer>
  );
}
