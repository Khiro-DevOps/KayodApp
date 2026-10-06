import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { effectiveRole } from "@/lib/roles";
import {
  ApplicationTrackerCard,
} from "./_components/ApplicationTrackerCard";
import { ApplicationRealtimeUpdates } from "./_components/ApplicationRealtimeUpdates";

export const metadata = {
  title: "My Applications | Kayod Platform",
  description: "Track and manage your active and past job applications.",
};

/**
 * Raw data returned from Supabase
 */
interface InterviewSchedule {
  id: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  room_name: string | null;
}

interface JobPosting {
  title: string | null;
  work_setup: string | null;
  location: string | null;
  departments:
    | {
        name: string | null;
      }
    | null;
}

interface RawJobApplication {
  id: string;
  job_id: string | null;
  status: string | null;
  created_at: string | null;
  match_score: number | null;
  rejection_reason: string | null;

  interview_schedules: InterviewSchedule[] | null;

  job_postings: JobPosting | null;
}

/**
 * Legacy application data
 */
interface LegacyApplication {
  id: string;
  job_posting_id: string | null;
  status: string | null;
}

/**
 * Applicant document data
 */
interface ApplicantDocument {
  application_id: string;
  file_url: string | null;
  hr_verified: boolean | null;
}

/**
 * Data used by the application tracker.
 *
 * This is intentionally defined locally so this page does not
 * depend on ApplicationTrackerCardData being exported.
 */
interface FormattedApplication {
  id: string;
  status: string;
  matchScore: number | null;
  submittedAt: string;
  rejectionReason: string | null;

  interview: InterviewSchedule | null;

  job: {
    title: string;
    department: string;
    workMode: string;
    locationName: string;
  };

  documentsUrl: string | null;
  documentsOpenCount: number;
}

export default async function ApplicantApplicationsPage() {
  const supabase = await createClient();

  // ============================================================
  // 1. Authenticate user
  // ============================================================

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ============================================================
  // 2. Get user role
  // ============================================================

  const authRole = user.user_metadata?.role as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = effectiveRole(profile?.role, authRole);

  if (role === "employee") {
    redirect("/employee/dashboard");
  }

  if (role === "hr_manager" || role === "admin") {
    redirect("/hr");
  }

  // ============================================================
  // 3. Get job applications
  // ============================================================

  const { data: jobAppsData, error: jobAppsError } = await supabase
    .from("job_applications")
    .select(`
      id,
      job_id,
      status,
      created_at,
      match_score,
      rejection_reason,
      interview_schedules (
        id,
        scheduled_at,
        duration_minutes,
        status,
        room_name
      ),
      job_postings:job_id (
        title,
        work_setup,
        location,
        departments (
          name
        )
      )
    `)
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false });

  if (jobAppsError) {
    console.error(
      "Error loading job applications:",
      jobAppsError
    );
  }

  // ============================================================
  // 4. Get legacy applications
  // ============================================================

  const { data: legacyAppsData, error: legacyAppsError } =
    await supabase
      .from("applications")
      .select(`
        id,
        job_posting_id,
        status
      `)
      .eq("candidate_id", user.id);

  if (legacyAppsError) {
    console.error(
      "Error loading legacy applications:",
      legacyAppsError
    );
  }

  const legacyApps: LegacyApplication[] =
    legacyAppsData ?? [];

  const legacyIds = legacyApps.map(
    (application) => application.id
  );

  // ============================================================
  // 5. Get applicant documents
  // ============================================================

  let requestedDocuments: ApplicantDocument[] = [];

  if (legacyIds.length > 0) {
    const { data: documents, error: documentsError } =
      await supabase
        .from("applicant_documents")
        .select(`
          application_id,
          file_url,
          hr_verified
        `)
        .in("application_id", legacyIds);

    if (documentsError) {
      console.error(
        "Error loading applicant documents:",
        documentsError
      );
    }

    requestedDocuments = documents ?? [];
  }

  // ============================================================
  // 6. Format applications
  // ============================================================

  const rawApplications =
    (jobAppsData ?? []) as unknown as RawJobApplication[];

  const formattedApplications: FormattedApplication[] =
    rawApplications.map((app) => {
      /**
       * Find the corresponding legacy application.
       */
      const legacyApplication = legacyApps.find(
        (legacy) =>
          legacy.job_posting_id === app.job_id
      );

      /**
       * Documents that are still requested/open.
       */
      const openDocuments = requestedDocuments.filter(
        (document) =>
          document.application_id ===
            legacyApplication?.id &&
          !document.file_url &&
          !document.hr_verified
      );

      /**
       * First scheduled interview, if any.
       */
      const interview =
        app.interview_schedules &&
        app.interview_schedules.length > 0
          ? app.interview_schedules[0]
          : null;

      return {
        id: app.id,

        status: app.status ?? "applied",

        matchScore: app.match_score ?? null,

        submittedAt:
          app.created_at ??
          new Date().toISOString(),

        rejectionReason:
          app.rejection_reason ?? null,

        interview,

        job: {
          title:
            app.job_postings?.title ??
            "Untitled Job",

          department:
            app.job_postings?.departments?.name ??
            "General",

          workMode:
            app.job_postings?.work_setup ??
            "onsite",

          locationName:
            app.job_postings?.location ??
            "Main Office",
        },

        documentsUrl:
          openDocuments.length > 0
            ? `/apply/applications/${app.id}/documents`
            : null,

        documentsOpenCount:
          openDocuments.length,
      };
    });

  // ============================================================
  // 7. Overview statistics
  // ============================================================

  const totalSubmitted =
    formattedApplications.length;

  const activeApplicationsCount =
    formattedApplications.filter((application) => {
      const status =
        application.status.toLowerCase();

      return (
        status !== "rejected" &&
        status !== "withdrawn"
      );
    }).length;

  const inPipelineCount =
    formattedApplications.filter((application) => {
      const status =
        application.status.toLowerCase();

      return ![
        "rejected",
        "withdrawn",
        "hired",
      ].includes(status);
    }).length;

  // ============================================================
  // 8. Render page
  // ============================================================

  return (
    <>
      <ApplicationRealtimeUpdates userId={user.id}/>

      {/* Header */}
      <section className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Application Tracker
        </h1>

        <p className="mt-2 text-muted-foreground">
          Monitor your job applications, pipeline stages,
          and interview progress.
        </p>
      </section>

      {/* Overview Stats */}
      <section className="mb-8 grid gap-4 md:grid-cols-3">
        {/* Active Applications */}
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Active Applications
          </p>

          <p className="mt-2 text-3xl font-bold">
            {activeApplicationsCount}
          </p>
        </div>

        {/* In Pipeline */}
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            In Pipeline
          </p>

          <p className="mt-2 text-3xl font-bold">
            {inPipelineCount}
          </p>
        </div>

        {/* Total Submitted */}
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Total Submitted
          </p>

          <p className="mt-2 text-3xl font-bold">
            {totalSubmitted}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Lifetime
          </p>
        </div>
      </section>

      {/* Applications */}
      {formattedApplications.length === 0 ? (
        <section className="flex flex-col items-center justify-center rounded-lg border bg-card px-6 py-16 text-center">
          {/* Empty state icon */}
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h6.586a2 2 0 011.414.586l3.414 3.414A2 2 0 0119 8.414V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-semibold">
            No Applications Found
          </h2>

          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            You haven't submitted any job applications yet.
            Browse available jobs and submit an application
            to start tracking here.
          </p>

          <Link
            href="/jobs"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Explore Openings
          </Link>
        </section>
      ) : (
        <section>
          <h2 className="mb-4 text-xl font-semibold">
            Your Applications
          </h2>

          <div className="space-y-4">
            {formattedApplications.map((application) => (
              <ApplicationTrackerCard
                key={application.id}
                application={application}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}