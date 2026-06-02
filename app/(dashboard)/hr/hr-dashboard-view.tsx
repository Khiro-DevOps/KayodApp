"use client";

import Link from "next/link";
import { useState } from "react";

type HRDashboardViewProps = {
  fullName: string;
  roleLabelText: string;
};

export default function HRDashboardView({ fullName, roleLabelText }: HRDashboardViewProps) {
  const [timeRange, setTimeRange] = useState("Last 6 Months");

  return (
    <div className="space-y-xxl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md mb-xxl">
        <div>
          <h1 className="font-h1 text-h1 text-on-background mb-1 flex items-center gap-2">
            HR Admin Dashboard
            <span className="text-[11px] font-semibold bg-primary-container/20 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider">
              {roleLabelText}
            </span>
          </h1>
          <p className="font-body text-body text-outline">
            Welcome back, {fullName} • Overview of workforce metrics and hiring pipelines
          </p>
        </div>
        <div>
          <Link
            href="/hr/jobs"
            className="bg-[#7C7AAC] hover:bg-[#4A4880] text-white px-xl py-3 rounded-lg flex items-center justify-center gap-sm transition-all font-medium whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Post New Job
          </Link>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg mb-xxl">
        {/* Total Employees */}
        <div className="bg-white hairline-border rounded-xl p-card-padding">
          <div className="flex justify-between items-start mb-sm">
            <span className="material-symbols-outlined p-2 bg-primary-container/20 text-primary rounded-lg">
              group
            </span>
            <span className="text-success text-[12px] font-bold flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[14px]">trending_up</span> 2.4%
            </span>
          </div>
          <h3 className="font-label-caps text-label-caps text-outline uppercase mb-1">Total Employees</h3>
          <p className="font-h1 text-h1 text-on-background">1,284</p>
        </div>

        {/* Active Jobs */}
        <div className="bg-white hairline-border rounded-xl p-card-padding">
          <div className="flex justify-between items-start mb-sm">
            <span className="material-symbols-outlined p-2 bg-secondary-container/20 text-secondary rounded-lg">
              work
            </span>
          </div>
          <h3 className="font-label-caps text-label-caps text-outline uppercase mb-1">Active Jobs</h3>
          <p className="font-h1 text-h1 text-on-background">24</p>
        </div>

        {/* Pending Leaves */}
        <div className="bg-white hairline-border rounded-xl p-card-padding">
          <div className="flex justify-between items-start mb-sm">
            <span className="material-symbols-outlined p-2 bg-tertiary-container/20 text-tertiary rounded-lg">
              event_busy
            </span>
            <span className="bg-error-container text-on-error-container text-[10px] px-1.5 py-0.5 rounded font-bold">
              Action Needed
            </span>
          </div>
          <h3 className="font-label-caps text-label-caps text-outline uppercase mb-1">Pending Leaves</h3>
          <p className="font-h1 text-h1 text-on-background">18</p>
        </div>

        {/* Interviews Today */}
        <div className="bg-white hairline-border rounded-xl p-card-padding">
          <div className="flex justify-between items-start mb-sm">
            <span className="material-symbols-outlined p-2 bg-primary/10 text-primary rounded-lg">
              calendar_today
            </span>
          </div>
          <h3 className="font-label-caps text-label-caps text-outline uppercase mb-1">Interviews Today</h3>
          <p className="font-h1 text-h1 text-on-background">6</p>
        </div>
      </div>

      {/* Main Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
        {/* Workforce Health Index Chart */}
        <div className="lg:col-span-2 bg-white hairline-border rounded-xl p-card-padding flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-xl">
              <div>
                <h2 className="font-h2 text-h2 text-on-background">Workforce Health Index</h2>
                <p className="font-body text-body text-outline">Aggregated sentiment and engagement data</p>
              </div>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="text-body font-medium text-secondary bg-surface-container-low border-outline-variant rounded-lg px-3 py-1.5 outline-none cursor-pointer"
              >
                <option value="Last 6 Months">Last 6 Months</option>
                <option value="Year to Date">Year to Date</option>
              </select>
            </div>

            {/* Custom Bar Chart with Opacity Tiers */}
            <div className="h-[280px] flex items-end justify-between gap-md px-4 mt-lg">
              {/* JAN */}
              <div className="flex-1 flex flex-col items-center gap-sm group">
                <div className="w-full flex flex-col gap-0.5 items-center">
                  <div className="w-full bg-primary tier-1 rounded-t-sm h-12"></div>
                  <div className="w-full bg-primary tier-2 h-16"></div>
                  <div className="w-full bg-primary tier-3 h-10"></div>
                  <div className="w-full bg-primary tier-4 rounded-b-sm h-8"></div>
                </div>
                <span className="font-label-caps text-label-caps text-outline">JAN</span>
              </div>

              {/* FEB */}
              <div className="flex-1 flex flex-col items-center gap-sm group">
                <div className="w-full flex flex-col gap-0.5 items-center">
                  <div className="w-full bg-primary tier-1 rounded-t-sm h-16"></div>
                  <div className="w-full bg-primary tier-2 h-14"></div>
                  <div className="w-full bg-primary tier-3 h-12"></div>
                  <div className="w-full bg-primary tier-4 rounded-b-sm h-6"></div>
                </div>
                <span className="font-label-caps text-label-caps text-outline">FEB</span>
              </div>

              {/* MAR */}
              <div className="flex-1 flex flex-col items-center gap-sm group">
                <div className="w-full flex flex-col gap-0.5 items-center">
                  <div className="w-full bg-primary tier-1 rounded-t-sm h-14"></div>
                  <div className="w-full bg-primary tier-2 h-20"></div>
                  <div className="w-full bg-primary tier-3 h-8"></div>
                  <div className="w-full bg-primary tier-4 rounded-b-sm h-10"></div>
                </div>
                <span className="font-label-caps text-label-caps text-outline">MAR</span>
              </div>

              {/* APR */}
              <div className="flex-1 flex flex-col items-center gap-sm group">
                <div className="w-full flex flex-col gap-0.5 items-center">
                  <div className="w-full bg-primary tier-1 rounded-t-sm h-18"></div>
                  <div className="w-full bg-primary tier-2 h-16"></div>
                  <div className="w-full bg-primary tier-3 h-14"></div>
                  <div className="w-full bg-primary tier-4 rounded-b-sm h-4"></div>
                </div>
                <span className="font-label-caps text-label-caps text-outline">APR</span>
              </div>

              {/* MAY */}
              <div className="flex-1 flex flex-col items-center gap-sm group">
                <div className="w-full flex flex-col gap-0.5 items-center">
                  <div className="w-full bg-primary tier-1 rounded-t-sm h-20"></div>
                  <div className="w-full bg-primary tier-2 h-18"></div>
                  <div className="w-full bg-primary tier-3 h-12"></div>
                  <div className="w-full bg-primary tier-4 rounded-b-sm h-6"></div>
                </div>
                <span className="font-label-caps text-label-caps text-outline">MAY</span>
              </div>

              {/* JUN */}
              <div className="flex-1 flex flex-col items-center gap-sm group">
                <div className="w-full flex flex-col gap-0.5 items-center">
                  <div className="w-full bg-primary tier-1 rounded-t-sm h-12"></div>
                  <div className="w-full bg-primary tier-2 h-10"></div>
                  <div className="w-full bg-primary tier-3 h-20"></div>
                  <div className="w-full bg-primary tier-4 rounded-b-sm h-12"></div>
                </div>
                <span className="font-label-caps text-label-caps text-outline">JUN</span>
              </div>
            </div>
          </div>

          <div className="mt-xl flex items-center justify-center gap-xxl border-t border-outline-variant pt-lg flex-wrap">
            <div className="flex items-center gap-sm">
              <div className="w-3 h-3 bg-primary tier-1 rounded-sm"></div>
              <span className="text-label-caps font-label-caps text-on-surface">Retention</span>
            </div>
            <div className="flex items-center gap-sm">
              <div className="w-3 h-3 bg-primary tier-2 rounded-sm"></div>
              <span className="text-label-caps font-label-caps text-on-surface">Morale</span>
            </div>
            <div className="flex items-center gap-sm">
              <div className="w-3 h-3 bg-primary tier-3 rounded-sm"></div>
              <span className="text-label-caps font-label-caps text-on-surface">Feedback Rate</span>
            </div>
            <div className="flex items-center gap-sm">
              <div className="w-3 h-3 bg-primary tier-4 rounded-sm"></div>
              <span className="text-label-caps font-label-caps text-on-surface">Absence Rate</span>
            </div>
          </div>
        </div>

        {/* Recent Applications / Quick Actions Sidebar */}
        <div className="bg-white hairline-border rounded-xl p-card-padding">
          <div className="flex items-center justify-between mb-xl">
            <h2 className="font-h2 text-h2 text-on-background">Quick Actions</h2>
            <Link href="/hr/applicants" className="text-primary text-[12px] font-bold hover:underline">
              View Hub
            </Link>
          </div>

          <div className="space-y-md">
            {/* Marcus Chen */}
            <Link
              href="/hr/applicants"
              className="flex items-center gap-md p-3 rounded-lg hover:bg-surface-container transition-colors cursor-pointer hairline-border block"
            >
              <div className="flex items-center gap-md w-full">
                <img
                  alt="Candidate Marcus Chen"
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDnDmpSF32QCJsVejQU4TMY6QYWKOGcMGA80ITL6fUdhs-rjvsW8jEnDXHXVEA1gsVANJE1fPMpz02c3XqN0vKRxSzsabfZe40r74Y4DC7V4MHw0DuVvh_OSXmq2KuUP08T8yo05jCSV_w0S_vxHMQf3I2BW2t_P360GRB3nKCqP7qXUr3Y3RlKircuFSSPZ_o6f58QakqmEBTDUmF7z1udn2xs1QxtBd-A3cBDynMf_iOihuiyyITCBf_4AUPwhi5pLf8aTzP6ik4W"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-h3 text-h3 text-on-background truncate">Marcus Chen</p>
                  <p className="text-label-caps font-label-caps text-outline truncate">Senior Product Designer</p>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end">
                  <span className="bg-[#E1F5EE] text-[#0F6E56] text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                    MATCH 94%
                  </span>
                </div>
              </div>
            </Link>

            {/* Elena Rodriguez */}
            <Link
              href="/hr/applicants"
              className="flex items-center gap-md p-3 rounded-lg hover:bg-surface-container transition-colors cursor-pointer hairline-border block"
            >
              <div className="flex items-center gap-md w-full">
                <img
                  alt="Candidate Elena Rodriguez"
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDtqKEVxJ4OESaJ-bcPnEywD3kRPlBFlK3Gs5Kk4kVmEJpuPCN2gCeY85RtAjuWNSjMFVsKpy0fDwLf_2NadKcoTd--GyICIqmz2kVWDeGdC_9GIvNMNYtDqfJ4ZgjPTJMfwCY3EZbLZy7xjx0RuSFpFttggnnCELrqsDpfvF6Kd7Vi2jLvKtxnicLm4LHbqEf0L8CWAC3jTRYTJCp1zo8QcPwFlkXvQl2-VEHawrvxm80VUGds-EGdNOLclykbIdTvDcogeXrnOZc3"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-h3 text-h3 text-on-background truncate">Elena Rodriguez</p>
                  <p className="text-label-caps font-label-caps text-outline truncate">Full Stack Engineer</p>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end">
                  <span className="bg-[#FDF2E9] text-[#93522E] text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                    MATCH 78%
                  </span>
                </div>
              </div>
            </Link>

            {/* Performance Review */}
            <div className="flex items-center gap-md p-3 rounded-lg hover:bg-surface-container transition-colors cursor-pointer hairline-border">
              <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary flex-shrink-0">
                <span className="material-symbols-outlined">add_task</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-h3 text-h3 text-on-background truncate">Q2 Performance Review</p>
                <p className="text-label-caps font-label-caps text-outline truncate">Due in 3 days • 12 pending</p>
              </div>
            </div>

            {/* Onboarding Pipeline */}
            <div className="mt-xl pt-lg border-t border-outline-variant">
              <div className="bg-surface-container-low rounded-xl p-md flex items-center justify-between gap-sm">
                <div className="min-w-0">
                  <p className="font-h3 text-h3 text-on-background truncate">Onboarding Pipeline</p>
                  <p className="text-[11px] text-outline truncate">4 new hires starting Monday</p>
                </div>
                <div className="flex -space-x-2 flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-primary border-2 border-white flex items-center justify-center text-[10px] text-white font-bold">
                    JD
                  </div>
                  <div className="w-7 h-7 rounded-full bg-secondary border-2 border-white flex items-center justify-center text-[10px] text-white font-bold">
                    AK
                  </div>
                  <div className="w-7 h-7 rounded-full bg-tertiary border-2 border-white flex items-center justify-center text-[10px] text-white font-bold">
                    +2
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}