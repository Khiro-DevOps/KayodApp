import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { scheduleInterview } from "../actions";

interface Props {
  searchParams: Promise<{ application_id?: string; error?: string }>;
}

export default async function ScheduleInterviewPage({ searchParams }: Props) {
  const { application_id, error } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";
  if (!isHR) redirect("/dashboard");

  // Fetch all shortlisted applications if no specific one selected
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id,
      status,
      submitted_at,
      profiles ( first_name, last_name, email ),
      job_postings ( title )
    `)
    .in("status", ["submitted", "under_review", "shortlisted"])
    .order("submitted_at", { ascending: false });

  // If specific application selected, get its details
  let selectedApp = null;
  if (application_id) {
    selectedApp = applications?.find((a) => a.id === application_id) ?? null;
  }

  return (
    <PageContainer>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/interviews" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Schedule Interview
          </h1>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form action={scheduleInterview} className="space-y-4">
          {/* Select applicant */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">
              Select applicant
            </label>
            <select
              name="application_id"
              required
              defaultValue={application_id ?? ""}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
            >
              <option value="" disabled>Choose an applicant...</option>
              {applications?.map((app) => {
                const candidate = app.profiles as unknown as { first_name: string; last_name: string };
                const job = app.job_postings as unknown as { title: string };
                return (
                  <option key={app.id} value={app.id}>
                    {candidate?.first_name} {candidate?.last_name} — {job?.title}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Interview type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">
              Interview type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="interview_type" value="online" defaultChecked className="accent-primary" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Online</p>
                  <p className="text-xs text-text-secondary">Video call via Daily.co</p>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="interview_type" value="in_person" className="accent-primary" />
                <div>
                  <p className="text-sm font-medium text-text-primary">In person</p>
                  <p className="text-xs text-text-secondary">At your office</p>
                </div>
              </label>
            </div>
          </div>

          {/* Date and time */}
          <div className="space-y-1.5">
            <label htmlFor="scheduled_at" className="text-sm font-medium text-text-primary">
              Date and time
            </label>
            <input
              id="scheduled_at"
              name="scheduled_at"
              type="datetime-local"
              required
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <label htmlFor="duration_minutes" className="text-sm font-medium text-text-primary">
              Duration
            </label>
            <select
              id="duration_minutes"
              name="duration_minutes"
              defaultValue="60"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
            >
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </div>

          {/* Location (for in-person) */}
          <div className="space-y-1.5">
            <label htmlFor="location_address" className="text-sm font-medium text-text-primary">
              Location <span className="text-text-tertiary font-normal">(for in-person)</span>
            </label>
            <input
              id="location_address"
              name="location_address"
              type="text"
              placeholder="e.g. 3F Ayala Tower, Cebu City"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label htmlFor="location_notes" className="text-sm font-medium text-text-primary">
              Notes for candidate <span className="text-text-tertiary font-normal">(optional)</span>
            </label>
            <textarea
              id="location_notes"
              name="location_notes"
              rows={3}
              placeholder="e.g. Please bring a copy of your resume. Ask for Juan at reception."
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            Schedule interview
          </button>
        </form>
      </div>
    </PageContainer>
  );
}
