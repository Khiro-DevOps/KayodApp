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
  resumes: number;
};

type CandidateInterviewRow = {
  id: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  room_name: string | null;
  video_provider: string | null;
  job?: { title?: string } | { title?: string }[] | null;
  application?: {
    id?: string;
  } | null;
};

const initialStats: CandidateStats = {
  applications: 0,
  interviews: 0,
  resumes: 0,
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
        const [applicationsResult, interviewsResult, resumesResult, upcomingInterviewsResult] = await Promise.all([
          supabase
            .from("applications")
            .select("*", { count: "exact", head: true })
            .eq("candidate_id", identity.userId),
          supabase
            .from("interview_schedules")
            .select("*", { count: "exact", head: true })
            .eq("applicant_id", identity.userId)
            .in("status", ["proposed", "scheduled", "rescheduled"]),
          supabase
            .from("resumes")
            .select("id", { count: "exact", head: true })
            .eq("candidate_id", identity.userId),
          supabase
            .from("interview_schedules")
            .select("id, scheduled_at, duration_minutes, status, room_name, video_provider, job:job_postings(title), application:job_applications(id)")
            .eq("applicant_id", identity.userId)
            .in("status", ["proposed", "scheduled", "rescheduled"])
            .gte("scheduled_at", new Date().toISOString())
            .order("scheduled_at", { ascending: true })
            .limit(1),
        ]);

        const candidateInterviews = (upcomingInterviewsResult.data ?? []) as CandidateInterviewRow[];

        if (!isMounted) {
          return;
        }

        setStats({
          applications: applicationsResult.count ?? 0,
          interviews: interviewsResult.count ?? 0,
          resumes: resumesResult.count ?? 0,
        });

        const upcomingInterview = candidateInterviews?.[0];
        if (upcomingInterview) {
          const job = Array.isArray(upcomingInterview.job)
            ? upcomingInterview.job[0]
            : upcomingInterview.job;

          setNextInterview({
            title: job?.title ?? "Interview",
            scheduledAt: upcomingInterview.scheduled_at ?? new Date().toISOString(),
            interviewType: upcomingInterview.video_provider === "webrtc" ? "online" : "in_person",
            locationAddress: null,
            locationNotes: null,
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
    <div className="mx-auto max-w-6xl space-y-6">
      {error ? (
        <div className="mx-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* --- MOBILE ONLY VIEW (Inverted Navy Header Banner) --- */}
      <div className="block md:hidden bg-[#1F195E] text-white p-6 pb-12 -mx-6 -mt-6 mb-[-32px] rounded-b-[40px]">
        {/* Greeting Section */}
        <div className="mb-6 flex flex-col">
          <span className="text-sm opacity-80">Hello,</span>
          <h1 className="text-2xl font-bold text-white">{displayName}</h1>
          <span className="text-sm opacity-80">Find your next opportunity</span>
        </div>

        {/* 2-Column Stat Cards for Mobile */}
        <div className="grid grid-cols-2 gap-4">
          <StatCardVision title="Applications" value={stats.applications} />
          <StatCardVision title="Interview pending" value={stats.interviews} />
        </div>
      </div>

      {/* --- DESKTOP ONLY VIEW (Clean, Aligned Layout) --- */}
      <div className="hidden md:block space-y-6">
        <header className="space-y-1">
          <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-semibold text-on-background">
            Hello, {displayName}
          </h1>
        </header>

        {/* 4-Column Stat Cards for Desktop */}
        <div className="grid grid-cols-4 gap-6">
          <StatCardVision title="Applications" value={stats.applications} />
          <StatCardVision title="Interview pending" value={stats.interviews} />
          <StatCardVision title="Next Interview" value={nextInterview ? 1 : 0} />
          <StatCardVision title="Resumes" value={stats.resumes} />
        </div>
      </div>

      {/* --- SHARED MAIN CONTENT AREA --- */}
      <div className="pt-6 md:pt-0 space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          {nextInterview ? (
            <Link
              href="/applicant/applications"
              className="rounded-[28px] border border-[#E0D9FC] bg-white p-5 shadow-[0_12px_28px_rgba(46,37,102,0.08)] transition-transform hover:-translate-y-0.5 hover:bg-[#FCFBFF]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b688d]">Upcoming Interview</p>
                  <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-on-background">
                    {nextInterview.title}
                  </h2>
                  <p className="mt-1 text-sm text-outline">
                    {new Date(nextInterview.scheduledAt).toLocaleString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="rounded-full border border-[#E0D9FC] bg-[#F8F6FF] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5B5784]">
                  {nextInterview.interviewType === "online" ? "Online" : "In person"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <InfoChip icon="schedule" label="Scheduled" value={new Date(nextInterview.scheduledAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })} />
                <InfoChip icon="work" label="Source" value="Applications" />
              </div>

              {nextInterview.interviewType === "in_person" && nextInterview.locationAddress ? (
                <div className="mt-4 rounded-2xl border border-[#E0D9FC] bg-[#F8F6FF] px-4 py-3 text-sm text-on-background">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6b688d]">Location</p>
                  <p className="mt-1">
                    {nextInterview.locationAddress}
                    {nextInterview.locationNotes ? ` — ${nextInterview.locationNotes}` : ""}
                  </p>
                </div>
              ) : null}
            </Link>
          ) : (
            <div className="rounded-[28px] border border-dashed border-[#E0D9FC] bg-white p-5 shadow-[0_12px_28px_rgba(46,37,102,0.08)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b688d]">Upcoming Interview</p>
              <div className="mt-4 rounded-2xl border border-dashed border-[#E0D9FC] bg-[#FCFBFF] px-4 py-6 text-sm text-outline">
                No upcoming interview yet. Check Applications for interview status updates.
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="rounded-[28px] border border-card-border bg-white p-5 shadow-[0_12px_28px_rgba(46,37,102,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b688d]">Need a shortcut</p>
                  <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-on-background">
                    Interviews live inside Applications
                  </h2>
                  <p className="mt-1 text-sm text-outline">
                    Open the applications hub to review your scheduled interview details and the latest status updates.
                  </p>
                </div>
              </div>

              <Link
                href="/applicant/applications"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                Open Applications
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
            </div>

            <div className="rounded-[28px] border border-card-border bg-white p-5 shadow-[0_12px_28px_rgba(46,37,102,0.08)]">
              <ActivityCard stats={stats} nextInterview={nextInterview} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCardVision({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm text-[#1F195E]">
      <p className="text-[32px] font-bold text-[#4C3A96] leading-none mb-2">{value}</p>
      <p className="text-sm font-semibold text-[#1F195E]">{title}</p>
    </div>
  );
}

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E0D9FC] bg-[#FCFBFF] px-4 py-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0ECFF] text-primary">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6b688d]">{label}</p>
        <p className="text-sm font-semibold text-on-background">{value}</p>
      </div>
    </div>
  );
}

function ActivityCard({
  stats,
  nextInterview,
}: {
  stats: CandidateStats;
  nextInterview: {
    title: string;
    scheduledAt: string;
    interviewType: "online" | "in_person";
    locationAddress: string | null;
    locationNotes: string | null;
  } | null;
}) {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b688d]">Application Journey</p>
          <p className="mt-1 text-sm text-outline">A compact view of where you stand right now.</p>
        </div>
        <span className="rounded-full border border-[#E0D9FC] bg-[#F8F6FF] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5B5784]">
          Overview
        </span>
      </div>

      <div className="space-y-3">
        <JourneyRow label="Applications" value={`${stats.applications} active`} icon="description" />
        <JourneyRow label="Interviews" value={`${stats.interviews} scheduled`} icon="event" />
        <JourneyRow label="Next interview" value={nextInterview ? new Date(nextInterview.scheduledAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "None yet"} icon="schedule" />
        <JourneyRow label="Resume" value="Ready to submit" icon="upload_file" />
      </div>
    </div>
  );
}

function JourneyRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#E0D9FC] bg-[#FCFBFF] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0ECFF] text-primary">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
        <div>
          <p className="text-sm font-semibold text-on-background">{label}</p>
          <p className="text-xs text-outline">{value}</p>
        </div>
      </div>
      <span className="material-symbols-outlined text-[18px] text-[#5B5784]">arrow_forward</span>
    </div>
  );
}