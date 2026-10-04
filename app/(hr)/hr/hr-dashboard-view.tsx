"use client";

import Link from "next/link";

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main mb-1 flex items-center gap-2">
            HR Admin Dashboard
            <span className="text-[11px] font-semibold bg-primary-light text-primary-dark px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {roleLabelText}
            </span>
          </h1>
          <p className="text-sm text-text-muted">
            Welcome back, {fullName} • Overview of workforce metrics and hiring pipelines
          </p>
        </div>
        <div>
          <Link
            href="/hr/jobs/manage"
            className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm font-semibold shadow-xs whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Post New Job
          </Link>
        </div>
      </div>

      {/* Dashboard Grid - Metrics */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Employees */}
        <div className="rounded-xl border border-border bg-card-bg p-5 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <span className="material-symbols-outlined p-2 bg-primary-light text-primary-dark rounded-lg text-[20px]">
              group
            </span>
          </div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Total Employees</h3>
          <p className="text-2xl font-bold text-text-main">{totalEmployees.toLocaleString()}</p>
        </div>

        {/* Active Jobs */}
        <div className="rounded-xl border border-border bg-card-bg p-5 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <span className="material-symbols-outlined p-2 bg-primary-light text-primary-dark rounded-lg text-[20px]">
              work
            </span>
          </div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Active Jobs</h3>
          <p className="text-2xl font-bold text-text-main">{activeJobs.toLocaleString()}</p>
        </div>

        {/* Pending Leaves */}
        <div className="rounded-xl border border-border bg-card-bg p-5 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <span className="material-symbols-outlined p-2 bg-primary-light text-primary-dark rounded-lg text-[20px]">
              event_busy
            </span>
            {pendingLeaves > 0 && (
              <span className="bg-warning-bg text-warning border border-warning/20 text-[10px] px-2 py-0.5 rounded-full font-bold">
                Action Needed
              </span>
            )}
          </div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Pending Leaves</h3>
          <p className="text-2xl font-bold text-text-main">{pendingLeaves.toLocaleString()}</p>
        </div>

        {/* Interviews Today */}
        <div className="rounded-xl border border-border bg-card-bg p-5 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <span className="material-symbols-outlined p-2 bg-primary-light text-primary-dark rounded-lg text-[20px]">
              calendar_today
            </span>
          </div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Interviews Today</h3>
          <p className="text-2xl font-bold text-text-main">{interviewsToday.toLocaleString()}</p>
        </div>
      </div>

      {/* Main Analytics & Candidates Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Workforce Health Index Section */}
        <div className="lg:col-span-2 min-h-[390px] bg-card-bg border border-border rounded-xl p-5 flex flex-col shadow-xs min-w-0">
          <div className="flex min-h-0 flex-1 flex-col min-w-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-text-main">Workforce Health Index</h2>
                <p className="text-xs text-text-muted">Aggregated sentiment and engagement telemetry</p>
              </div>
            </div>

            {/* Honest Low-Data State */}
            <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center text-center p-6 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mb-3">
                <span className="material-symbols-outlined text-[24px]">analytics</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Not enough data yet</h3>
              <p className="w-full min-w-[250px] whitespace-normal break-words text-center text-sm text-muted-foreground leading-relaxed block">
                Workforce sentiment metrics (retention, morale, feedback rate, absence rate) will render here automatically as employee check-ins and performance surveys accumulate.
              </p>
            </div>
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-primary rounded-sm"></div>
              <span className="text-xs font-medium text-text-main">Retention</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-primary/70 rounded-sm"></div>
              <span className="text-xs font-medium text-text-main">Morale</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-primary/40 rounded-sm"></div>
              <span className="text-xs font-medium text-text-main">Feedback Rate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-primary/20 rounded-sm"></div>
              <span className="text-xs font-medium text-text-main">Absence Rate</span>
            </div>
          </div>
        </div>

        {/* Real Top Applicants / Quick Actions Sidebar */}
        <div className="flex flex-col justify-between rounded-xl border border-border bg-card-bg p-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text-main">Top Candidates</h2>
              <Link href="/hr/applicants" className="text-primary text-xs font-bold hover:underline">
                View Hub
              </Link>
            </div>

            <div className="space-y-3">
              {topCandidates.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-border rounded-xl bg-surface-bg">
                  <p className="text-xs text-text-muted">No applications submitted yet.</p>
                </div>
              ) : (
                topCandidates.map((candidate) => (
                  <Link
                    key={candidate.id}
                    href="/hr/applicants"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-bg transition-colors cursor-pointer border border-border block"
                  >
                    <div className="flex items-center gap-3 w-full">
                      {candidate.avatarUrl ? (
                        <img
                          alt={candidate.name}
                          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                          src={candidate.avatarUrl}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary-light text-primary-dark flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {candidate.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-main whitespace-normal break-words leading-snug">{candidate.name}</p>
                        <p className="text-xs text-text-muted whitespace-normal break-words leading-snug">{candidate.jobTitle}</p>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end">
                        {candidate.matchScore !== null ? (
                          <span className="bg-success-bg text-success border border-success/20 text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap">
                            {candidate.matchScore}% MATCH
                          </span>
                        ) : (
                          <span className="bg-surface-bg text-text-muted border border-border text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap">
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
          <div className="mt-6 pt-4 border-t border-border space-y-2">
            <Link
              href="/hr/leaves"
              className="flex items-center justify-between p-3 rounded-lg bg-surface-bg hover:bg-primary-light/30 transition-colors border border-border block"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[20px]">event_repeat</span>
                <span className="text-xs font-semibold text-text-main">Review Leave Requests</span>
              </div>
              <span className="text-xs font-bold text-primary">{pendingLeaves}</span>
            </Link>
            <Link
              href="/hr/schedules"
              className="flex items-center justify-between p-3 rounded-lg bg-surface-bg hover:bg-primary-light/30 transition-colors border border-border block"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[20px]">calendar_month</span>
                <span className="text-xs font-semibold text-text-main">Manage Team Schedules</span>
              </div>
              <span className="text-xs text-text-muted font-medium">View →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}