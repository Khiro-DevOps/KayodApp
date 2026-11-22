"use client";

import Link from "next/link";
import {
  GlassStatTile,
  PageHeroHeader,
  SolidSurfaceCard,
} from "@/components/ui/option-b-surfaces";
import { MatchScorePill } from "@/components/ui/match-score-pill";

export type TopCandidateMatch = {
  id: string;
  name: string;
  jobTitle: string;
  avatarUrl: string | null;
  matchScore: number | null;
};

type HRDashboardViewProps = {
  fullName: string;
  roleLabelText: string;
  totalEmployees: number;
  activeJobs: number;
  pendingLeaves: number;
  interviewsToday: number;
  topCandidates: TopCandidateMatch[];
};

export default function HRDashboardView({
  fullName,
  roleLabelText,
  totalEmployees,
  activeJobs,
  pendingLeaves,
  interviewsToday,
  topCandidates,
}: HRDashboardViewProps) {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeroHeader
        title="HR Admin Dashboard"
        titleBadge={
          <span className="rounded-full bg-[#EDE9F9] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#1E1B4B]">
            {roleLabelText}
          </span>
        }
        subtitle={`Welcome back, ${fullName} • Overview of workforce metrics and hiring pipelines`}
        actions={
          <Link
            href="/hr/jobs"
            className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#1E1B4B] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-indigo-900"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Post New Job
          </Link>
        }
      />

      {/* Dashboard Grid - Metrics */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">group</span>}
          label="Total Employees"
          value={totalEmployees.toLocaleString()}
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">work</span>}
          label="Active Jobs"
          value={activeJobs.toLocaleString()}
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">event_busy</span>}
          label="Pending Leaves"
          value={pendingLeaves.toLocaleString()}
          badge={
            pendingLeaves > 0 ? (
              <span className="rounded-full border border-warning/20 bg-warning-bg px-2.5 py-0.5 text-[10px] font-bold text-warning">
                Action Needed
              </span>
            ) : undefined
          }
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">calendar_today</span>}
          label="Interviews Today"
          value={interviewsToday.toLocaleString()}
        />
      </div>

      {/* Main Analytics & Candidates Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Workforce Health Index Section */}
        <SolidSurfaceCard className="lg:col-span-2 min-h-[390px] flex flex-col min-w-0">
          <div className="flex min-h-0 flex-1 flex-col min-w-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#1E1B4B]">Workforce Health Index</h2>
                <p className="text-xs text-text-muted">Aggregated sentiment and engagement telemetry</p>
              </div>
            </div>

            {/* Honest Low-Data State */}
            <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center text-center p-6 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-[#1E1B4B] flex items-center justify-center shrink-0 mb-3">
                <span className="material-symbols-outlined text-[24px]">analytics</span>
              </div>
              <h3 className="font-semibold text-[#1E1B4B] mb-1">Not enough data yet</h3>
              <p className="w-full min-w-[250px] whitespace-normal break-words text-center text-sm text-muted-foreground leading-relaxed block">
                Workforce sentiment metrics (retention, morale, feedback rate, absence rate) will render here automatically as employee check-ins and performance surveys accumulate.
              </p>
            </div>
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-[#1E1B4B] rounded-sm"></div>
              <span className="text-xs font-medium text-text-main">Retention</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-indigo-500 rounded-sm"></div>
              <span className="text-xs font-medium text-text-main">Morale</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-indigo-300 rounded-sm"></div>
              <span className="text-xs font-medium text-text-main">Feedback Rate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-indigo-100 rounded-sm"></div>
              <span className="text-xs font-medium text-text-main">Absence Rate</span>
            </div>
          </div>
        </SolidSurfaceCard>

        {/* Real Top Applicants / Quick Actions Sidebar (Frosted Glass Side Rail) */}
        <div className="flex flex-col justify-between rounded-3xl border border-indigo-100/80 bg-white/75 p-5 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#1E1B4B]">Top Candidates</h2>
              <Link href="/hr/applicants" className="text-[#1E1B4B] text-xs font-bold hover:underline">
                View Hub
              </Link>
            </div>

            <div className="space-y-3">
              {topCandidates.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-200 rounded-2xl bg-white">
                  <p className="text-xs text-text-muted">No applications submitted yet.</p>
                </div>
              ) : (
                topCandidates.map((candidate) => (
                  <Link
                    key={candidate.id}
                    href="/hr/applicants"
                    className="flex items-center gap-3 p-3 rounded-2xl bg-white hover:border-[#1E1B4B]/40 transition-colors cursor-pointer border border-slate-200/80 shadow-xs"
                  >
                    <div className="flex items-center gap-3 w-full">
                      {candidate.avatarUrl ? (
                        <img
                          alt={candidate.name}
                          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                          src={candidate.avatarUrl}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#EDE9F9] text-[#1E1B4B] flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {candidate.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1E1B4B] whitespace-normal break-words leading-snug">{candidate.name}</p>
                        <p className="text-xs text-text-muted whitespace-normal break-words leading-snug">{candidate.jobTitle}</p>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end">
                        {candidate.matchScore !== null ? (
                          <MatchScorePill
                            score={candidate.matchScore}
                            suffix="MATCH"
                            size="xs"
                          />
                        ) : (
                          <span className="bg-slate-50 text-text-muted border border-slate-200 text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap">
                            NEW
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Quick Links Section */}
          <div className="mt-6 pt-4 border-t border-indigo-100/80 space-y-2.5">
            <Link
              href="/hr/leaves"
              className="flex items-center justify-between p-3.5 rounded-2xl bg-white hover:border-[#1E1B4B]/40 transition-colors border border-slate-200/80 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#1E1B4B] text-[20px]">event_repeat</span>
                <span className="text-xs font-semibold text-[#1E1B4B]">Review Leave Requests</span>
              </div>
              <span className="rounded-full bg-[#EDE9F9] px-2 py-0.5 text-xs font-bold text-[#1E1B4B]">{pendingLeaves}</span>
            </Link>
            <Link
              href="/hr/schedules"
              className="flex items-center justify-between p-3.5 rounded-2xl bg-white hover:border-[#1E1B4B]/40 transition-colors border border-slate-200/80 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#1E1B4B] text-[20px]">calendar_month</span>
                <span className="text-xs font-semibold text-[#1E1B4B]">Manage Team Schedules</span>
              </div>
              <span className="text-xs text-text-muted font-medium">View →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}