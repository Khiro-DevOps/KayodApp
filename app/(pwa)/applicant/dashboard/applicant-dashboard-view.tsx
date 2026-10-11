"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPhtDate, formatPhtTime } from "@/lib/interview-date";
import { DEFAULT_DURATION_MINUTES } from "@/lib/interview-schedule-config";
import JoinInterviewButton from "@/components/interviews/JoinInterviewButton";


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

export interface DashboardInterviewRow {
  id: string;
  jobTitle: string;
  status: string;
  scheduledAt: string | null;
  durationMinutes: number | null;
  meetingType: string | null;
  meetingLink: string | null;
  selectedSlot: any;
  proposedSlots: any;
}

export default function ApplicantDashboardView({
  identity,
  displayName,
}: {
  identity: DashboardIdentity;
  displayName: string;
}) {
  const [stats, setStats] = useState<CandidateStats>(initialStats);
  const [upcomingInterviews, setUpcomingInterviews] = useState<DashboardInterviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const loadDashboard = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [applicationsResult, interviewsResult, resumesResult] = await Promise.all([
          // 1. Total Active Applications
          supabase
            .from("job_applications")
            .select("*", { count: "exact", head: true })
            .eq("applicant_id", identity.userId),

          // 2. All Active Interviews for Applicant
          supabase
            .from("interview_schedules")
            .select("id, status, scheduled_at, duration_minutes, meeting_type, meeting_link, proposed_slots, selected_slot, job:job_postings(title)")
            .eq("applicant_id", identity.userId)
            .in("status", ["proposed", "pending_selection", "scheduled", "rescheduled", "confirmed"])
            .order("created_at", { ascending: false }),

          // 3. Resumes
          supabase
            .from("resumes")
            .select("id", { count: "exact", head: true })
            .eq("candidate_id", identity.userId),
        ]);

        if (!isMounted) return;

        const rawInterviews = (interviewsResult.data ?? []) as any[];

        const mapped: DashboardInterviewRow[] = rawInterviews.map((row) => {
          const job = Array.isArray(row.job) ? row.job[0] : row.job;
          return {
            id: row.id,
            jobTitle: job?.title ?? "Interview Position",
            status: row.status,
            scheduledAt: row.scheduled_at,
            durationMinutes: row.duration_minutes,
            meetingType: row.meeting_type,
            meetingLink: row.meeting_link,
            selectedSlot: row.selected_slot,
            proposedSlots: row.proposed_slots,
          };
        });

        // Filter: proposed OR (scheduled with date >= now or null)
        const nowMs = Date.now();
        const activeUpcoming = mapped.filter((item) => {
          if (["proposed", "pending_selection"].includes(item.status)) return true;
          if (!item.scheduledAt) return true;
          const dur =
            typeof item.durationMinutes === "number" && item.durationMinutes > 0
              ? item.durationMinutes
              : item.selectedSlot?.start_time && item.selectedSlot?.end_time
              ? Math.round((new Date(item.selectedSlot.end_time).getTime() - new Date(item.selectedSlot.start_time).getTime()) / 60_000)
              : DEFAULT_DURATION_MINUTES;
          return new Date(item.scheduledAt).getTime() + (dur + 15) * 60_000 >= nowMs;
        });

        // Sort: scheduled items first sorted by start_time ascending, then proposed
        activeUpcoming.sort((a, b) => {
          const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : (a.proposedSlots?.[0]?.start_time ? new Date(a.proposedSlots[0].start_time).getTime() : Infinity);
          const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : (b.proposedSlots?.[0]?.start_time ? new Date(b.proposedSlots[0].start_time).getTime() : Infinity);
          return aTime - bTime;
        });

        const proposedCount = mapped.filter((i) => ["proposed", "pending_selection"].includes(i.status)).length;
        const scheduledCount = mapped.filter((i) => ["scheduled", "rescheduled", "confirmed"].includes(i.status)).length;

        setStats({
          applications: applicationsResult.count ?? 0,
          interviews: proposedCount,
          resumes: resumesResult.count ?? 0,
        });

        setUpcomingInterviews(activeUpcoming.slice(0, 5));
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
          <StatCardVision title="Next Interview" value={upcomingInterviews.length > 0 ? 1 : 0} />
          <StatCardVision title="Resumes" value={stats.resumes} />
        </div>
      </div>

      {/* --- SHARED MAIN CONTENT AREA --- */}
      <div className="pt-6 md:pt-0 space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[28px] border border-[#E0D9FC] bg-white p-5 shadow-[0_12px_28px_rgba(46,37,102,0.08)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b688d]">Upcoming Interviews</p>
                <h2 className="mt-1 font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-on-background">
                  Scheduled & Proposed Calls
                </h2>
              </div>
              <Link
                href="/applicant/interviews"
                className="text-xs font-semibold text-primary hover:underline"
              >
                View all →
              </Link>
            </div>

            {upcomingInterviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#E0D9FC] bg-[#FCFBFF] p-6 text-center text-sm text-outline">
                No upcoming interviews right now.
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingInterviews.map((item) => {
                  const isProposed = item.status === "proposed" || item.status === "pending_selection";
                  const modeLabel = item.meetingType === "in_person" ? "In person" : item.meetingType === "hybrid" ? "Hybrid" : "Online";

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-[#E0D9FC] bg-[#FCFBFF] p-4 space-y-3 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-on-background">{item.jobTitle}</h3>
                          {isProposed ? (
                            <p className="text-xs font-medium text-amber-700 mt-0.5">
                              Action Required · {item.meetingType === "hybrid" ? "Choose your time and mode" : "Proposed time slot"}
                            </p>
                          ) : (
                            <p className="text-xs text-outline mt-0.5">
                              {formatPhtDate(item.scheduledAt)} at {formatPhtTime(item.scheduledAt)}
                            </p>
                          )}
                        </div>

                        <span className="rounded-full border border-[#E0D9FC] bg-[#F8F6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#5B5784] uppercase tracking-[0.06em]">
                          {modeLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between border-t border-[#E0D9FC]/60 pt-3">
                        <span className="text-xs font-medium text-text-muted">
                          {isProposed ? "Awaiting your slot confirmation" : `Duration: ${item.durationMinutes || 60} mins`}
                        </span>

                        {isProposed ? (
                          <Link
                            href="/applicant/interviews"
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors shadow-xs"
                          >
                            {item.meetingType === "hybrid" ? "Choose your time & mode" : "Choose your time"}
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                          </Link>
                        ) : (
                          <JoinInterviewButton
                            interviewId={item.id}
                            meetingLink={item.meetingLink}
                            scheduledAt={item.scheduledAt}
                            durationMinutes={item.durationMinutes}
                            status={item.status}
                            meetingType={item.meetingType}
                            selectedSlot={item.selectedSlot}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
              <ActivityCard stats={stats} upcomingCount={upcomingInterviews.length} />
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
  upcomingCount,
}: {
  stats: CandidateStats;
  upcomingCount: number;
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
        <JourneyRow label="Interviews" value={`${stats.interviews} pending`} icon="event" />
        <JourneyRow label="Upcoming calls" value={`${upcomingCount} scheduled`} icon="schedule" />
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