"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type DashboardIdentity = {
  userId: string;
};

type CandidateStats = {
  applications: number;
  interviews: number;
};

type CandidateInterviewRow = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  interview_type: "online" | "in_person";
  status: string;
  location_address: string | null;
  location_notes: string | null;
  applications?: {
    job_postings?: { title?: string }[] | null;
  } | null;
};

const initialStats: CandidateStats = {
  applications: 0,
  interviews: 0,
};

export default function ApplicantDashboardView({
  identity,
  displayName,
}: {
  identity: DashboardIdentity;
  displayName: string;
}) {
  const [stats, setStats] = useState<CandidateStats>(initialStats);
  const [nextInterview, setNextInterview] = useState<{
    title: string;
    scheduledAt: string;
    interviewType: "online" | "in_person";
    locationAddress: string | null;
    locationNotes: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const loadDashboard = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [applicationsResult, interviewsResult] = await Promise.all([
          supabase
            .from("applications")
            .select("*", { count: "exact", head: true })
            .eq("candidate_id", identity.userId),
          supabase
            .from("applications")
            .select("*", { count: "exact", head: true })
            .eq("candidate_id", identity.userId)
            .eq("status", "interview_scheduled"),
        ]);

        const { data: candidateInterviews } = (await supabase
          .from("interviews")
          .select(
            `id, scheduled_at, duration_minutes, interview_type, status, location_address, location_notes, applications!inner(candidate_id, job_postings(title))`
          )
          .eq("applications.candidate_id", identity.userId)
          .in("status", ["scheduled", "confirmed", "rescheduled"])
          .order("scheduled_at", { ascending: true })
        ) as { data: CandidateInterviewRow[] | null };

        if (!isMounted) {
          return;
        }

        setStats({
          applications: applicationsResult.count ?? 0,
          interviews: interviewsResult.count ?? 0,
        });

        const upcomingInterview = candidateInterviews?.[0];
        if (upcomingInterview) {
          setNextInterview({
            title: upcomingInterview.applications?.job_postings?.[0]?.title ?? "Interview",
            scheduledAt: upcomingInterview.scheduled_at,
            interviewType: upcomingInterview.interview_type,
            locationAddress: upcomingInterview.location_address ?? null,
            locationNotes: upcomingInterview.location_notes ?? null,
          });
        } else {
          setNextInterview(null);
        }
      } catch {
        if (isMounted) {
          setError("Unable to load applicant dashboard data.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [identity.userId]);

  return (
    <div className="min-h-screen bg-[#fcf8ff] px-6 py-6 text-[#171542] lg:px-8">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <div className="flex items-start justify-between gap-4 pt-2">
          <div>
            <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-8 text-on-background">
              Applicant Dashboard
            </h1>
            <p className="mt-1 text-[14px] leading-[22px] text-outline">
              {isLoading ? "Loading your application activity..." : `Welcome back, ${displayName}`}
            </p>
          </div>

          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 rounded-lg bg-[#7C7AAC] px-5 py-3 font-medium text-white transition-colors hover:bg-[#4A4880]"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
            Browse Jobs
          </Link>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Applications" value={stats.applications} icon="description" tone="primary" />
          <StatCard label="Interviews" value={stats.interviews} icon="event" tone="secondary" />
          <StatCard label="Next Interview" value={nextInterview ? 1 : 0} icon="schedule" tone="tertiary" suffix={nextInterview ? "scheduled" : "none"} />
          <StatCard label="Resume" value={1} icon="upload_file" tone="accent" suffix="ready" />
        </section>

        {nextInterview ? (
          <Link
            href="/interviews"
            className="rounded-xl border border-[#E0D9FC] bg-white p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)] transition-colors hover:bg-[#F8F6FF]"
          >
            <div className="mb-2 flex items-center justify-between gap-4">
              <h2 className="font-[family-name:var(--font-poppins)] text-[18px] font-semibold text-on-background">
                Upcoming Interview
              </h2>
              <span className="rounded-full border border-[#E0D9FC] bg-[#F8F6FF] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5B5784]">
                {nextInterview.interviewType === "online" ? "Online" : "In person"}
              </span>
            </div>
            <p className="text-sm text-outline">{nextInterview.title}</p>
            <p className="mt-2 text-[14px] leading-6 text-on-background">
              {new Date(nextInterview.scheduledAt).toLocaleString("en-PH", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            {nextInterview.interviewType === "in_person" && nextInterview.locationAddress ? (
              <p className="mt-1 text-sm text-outline">
                {nextInterview.locationAddress}
                {nextInterview.locationNotes ? ` — ${nextInterview.locationNotes}` : ""}
              </p>
            ) : null}
          </Link>
        ) : (
          <div className="rounded-xl border border-dashed border-[#E0D9FC] bg-white p-5 text-sm leading-6 text-outline">
            No upcoming interview yet. Check your applications and job messages for updates.
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActivityCard />
          </div>

          <QuickActionsCard />
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  icon: string;
  tone: "primary" | "secondary" | "tertiary" | "accent";
  suffix?: string;
}) {
  const iconTone = {
    primary: "bg-[#E3DFFF] text-primary",
    secondary: "bg-[#E6DEFF] text-secondary",
    tertiary: "bg-[#E4DFFF] text-[#5B5784]",
    accent: "bg-[#E3DFFF] text-primary",
  }[tone];

  return (
    <div className="rounded-xl border border-card-border bg-white p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className={`rounded-lg p-2 ${iconTone}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
      </div>
      <h3 className="mb-1 font-[family-name:var(--font-inter)] text-[11px] font-medium uppercase tracking-[0.06em] text-outline">
        {label}
      </h3>
      <p className="font-[family-name:var(--font-poppins)] text-[28px] font-bold leading-none text-on-background">
        {value}
      </p>
      {suffix ? <p className="mt-1 text-[11px] uppercase tracking-[0.06em] text-outline">{suffix}</p> : null}
    </div>
  );
}

function ActivityCard() {
  return (
    <div className="rounded-xl border border-card-border bg-white p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold text-on-background">
            Your application journey
          </h2>
          <p className="mt-1 text-sm text-outline">
            Track your applications, interview status, and next steps.
          </p>
        </div>
        <span className="rounded-full border border-[#E0D9FC] bg-[#F8F6FF] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5B5784]">
          Overview
        </span>
      </div>

      <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[#E0D9FC] bg-[#FCFBFF] px-6 text-center">
        <div className="max-w-xl space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F0ECFF] text-primary">
            <span className="material-symbols-outlined text-[28px]">auto_awesome</span>
          </div>
          <p className="font-[family-name:var(--font-poppins)] text-[16px] font-semibold text-on-background">
            Your progress will appear here.
          </p>
          <p className="text-[14px] leading-6 text-outline">
            As your applications move forward, this dashboard will show interviews, offers, and the next steps.
          </p>
        </div>
      </div>
    </div>
  );
}

function QuickActionsCard() {
  return (
    <div className="rounded-xl border border-card-border bg-white p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold text-on-background">
          Quick Actions
        </h2>
        <Link href="/applications" className="text-[12px] font-bold text-primary hover:underline">
          View Hub
        </Link>
      </div>

      <div className="space-y-3">
        <QuickActionLink href="/jobs" icon="search" title="Browse Jobs" subtitle="Find new opportunities" />
        <QuickActionLink href="/resume" icon="description" title="Resume" subtitle="Update your profile" />
        <QuickActionLink href="/applications" icon="layers" title="Applications" subtitle="Check application status" />
        <QuickActionLink href="/interviews" icon="event" title="Interviews" subtitle="View upcoming interviews" />
      </div>
    </div>
  );
}

function QuickActionLink({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-[#E0D9FC] p-3 transition-colors hover:bg-[#F8F6FF]"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E2E2E9] text-primary">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate font-[family-name:var(--font-poppins)] text-[14px] font-semibold text-on-background">
          {title}
        </p>
        <p className="truncate font-[family-name:var(--font-inter)] text-[11px] uppercase tracking-[0.06em] text-outline">
          {subtitle}
        </p>
      </div>
    </Link>
  );
}