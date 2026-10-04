import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { effectiveRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";
import { ApplicationTrackerCard, ApplicationTrackerCardData } from "./_components/ApplicationTrackerCard";
import { ApplicationRealtimeUpdates } from "./_components/ApplicationRealtimeUpdates";

export const metadata = {
  title: "My Applications | Kayod Platform",
  description: "Track and manage your active and past job applications.",
};

interface RawJobApplication {
  id: string;
  status: string;
  submitted_at?: string | null;
  created_at?: string | null;
  rejection_reason?: string | null;
  job_postings?: {
    title?: string | null;
    work_setup?: string | null;
    location?: string | null;
    departments?: {
      name?: string | null;
    } | null;
  } | null;
  job_id?: string | null;
  interview_schedules?: Array<{
    id: string;
    scheduled_at?: string | null;
    duration_minutes?: number | null;
    status: string;
    room_name?: string | null;
  }> | null;
}

export default async function ApplicantApplicationsPage() {
  const supabase = await createClient();

  // 1. Authenticate the user session via Supabase server client
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Fetch role & verify access
  const authRole = user.user_metadata?.role as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);

  if (role === "employee") {
    redirect("/employee/dashboard");
  }

  if (role === "hr_manager" || role === "admin") {
    redirect("/hr");
  }

  // 3. Query job_applications using .eq('applicant_id', user.id)
  let formattedApplications: ApplicationTrackerCardData[] = [];

  const { data: jobAppsData } = await supabase
    .from("job_applications")
    .select(`
      id,
      status,
      created_at,
      rejection_reason,
      interview_schedules ( id, scheduled_at, duration_minutes, status, room_name ),
      job_postings:job_id (
        title,
        work_setup,
        location,
        departments ( name )
      )
    `)
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false });

  if (jobAppsData && jobAppsData.length > 0) {
    formattedApplications = (jobAppsData as unknown as RawJobApplication[]).map((app) => ({
      id: app.id,
      status: app.status || "applied",
      submittedAt: app.created_at || new Date().toISOString(),
      rejectionReason: app.rejection_reason,
      interview: app.interview_schedules?.[0] ?? null,
      job: {
        title: app.job_postings?.title || "Untitled Job",
        department: app.job_postings?.departments?.name || "General",
        workMode: app.job_postings?.work_setup || "onsite",
        locationName: app.job_postings?.location || "Main Office",
      },
    }));
  } else {
    // Fallback: query applications using .eq('candidate_id', user.id)
    const { data: appsData } = await supabase
      .from("applications")
      .select(`
        id,
        status,
        submitted_at,
        created_at,
        rejection_reason,
        job_postings:job_posting_id (
          title,
          work_setup,
          location,
          departments ( name )
        )
      `)
      .eq("candidate_id", user.id)
      .order("submitted_at", { ascending: false });

    if (appsData && appsData.length > 0) {
      formattedApplications = (appsData as unknown as RawJobApplication[]).map((app) => ({
        id: app.id,
        status: app.status || "submitted",
        submittedAt: app.submitted_at || app.created_at || new Date().toISOString(),
        rejectionReason: app.rejection_reason,
        interview: null,
        job: {
          title: app.job_postings?.title || "Untitled Job",
          department: app.job_postings?.departments?.name || "General",
          workMode: app.job_postings?.work_setup || "onsite",
          locationName: app.job_postings?.location || "Main Office",
        },
      }));
    }
  }

  // Calculate Overview Stats
  const totalSubmitted = formattedApplications.length;
  const activeApplicationsCount = formattedApplications.filter((app) => {
    const s = app.status.toLowerCase();
    return s !== "rejected" && s !== "withdrawn";
  }).length;

  return (
    <div className="w-full max-w-4xl min-w-0 flex flex-col mx-auto px-4 py-6 space-y-6">
      <ApplicationRealtimeUpdates userId={user.id} />
      {/* Header Section */}
      <div className="flex flex-col space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Application Tracker
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Monitor your job applications, pipeline stages, and interview progress.
        </p>
      </div>

      {/* Applicant Overview Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between space-y-1">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Active Applications
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {activeApplicationsCount}
            </span>
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
              In Pipeline
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between space-y-1">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Submitted
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-200">
              {totalSubmitted}
            </span>
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              Lifetime
            </span>
          </div>
        </div>
      </div>

      {/* Main Content List / Empty State */}
      {formattedApplications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900/60 flex flex-col items-center justify-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              No Applications Found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              You haven&apos;t submitted any job applications yet. Browse available jobs and submit an application to start tracking here.
            </p>
          </div>
          <Link
            href="/applicant/jobs"
            className="inline-flex items-center justify-center rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition-colors"
          >
            Explore Openings
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Your Applications
            </h2>
          </div>
          {formattedApplications.map((app) => (
            <ApplicationTrackerCard key={app.id} application={app} />
          ))}
        </div>
      )}
    </div>
  );
}