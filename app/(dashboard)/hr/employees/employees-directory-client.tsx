"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Home, Laptop, Users } from "lucide-react";
import { GlassStatTile, PageHeroHeader, SolidSurfaceCard } from "@/components/ui/option-b-surfaces";
import { reviewWfhLocationAction } from "@/app/(pwa)/employee/profile/wfh-actions";
import type { ContractWorkSetup } from "@/lib/work-arrangement";

export interface DirectoryEmployee {
  id: string;
  fullName: string;
  initials: string;
  jobTitle: string;
  departmentName: string | null;
  email: string | null;
  employmentStatus: string;
  workMode: ContractWorkSetup;
  workSetupLabel?: string;
  branchName: string;
  branchNeedsSetup?: boolean;
  branchStatus?: "ok" | "pending" | "setup";
  pendingWfhRequest?: {
    address: string;
    latitude: number;
    longitude: number;
    reason: string | null;
  } | null;
  monthlySalary: number;
  startDate: string | null;
}

type WorkModeFilter = "All" | "Onsite" | "Hybrid" | "WFH" | "Remote";

const FILTER_OPTIONS: WorkModeFilter[] = ["All", "Onsite", "Hybrid", "WFH", "Remote"];

function getStatusBadgeClasses(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (normalized === "onboarding") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (normalized === "probation") {
    return "bg-purple-50 text-purple-700 border-purple-200";
  }
  if (normalized === "on_leave") {
    return "bg-sky-50 text-sky-700 border-sky-200";
  }
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function getWorkModeBadgeClasses(mode: DirectoryEmployee["workMode"]): string {
  if (mode === "hybrid") {
    return "bg-purple-50 text-purple-700 border-purple-200";
  }
  if (mode === "remote" || mode === "wfh") {
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function EmployeesDirectoryClient({
  employees,
}: {
  employees: DirectoryEmployee[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<WorkModeFilter>("All");

  const handleReviewWfh = (employeeId: string, decision: "approve" | "reject") => {
    startTransition(async () => {
      const res = await reviewWfhLocationAction({ employeeId, decision });
      if (!res.success) {
        toast.error(res.error || "Failed to review WFH request");
        return;
      }
      toast.success(
        decision === "approve"
          ? "WFH residence location approved"
          : "WFH residence request declined",
      );
      router.refresh();
    });
  };

  const kpis = useMemo(() => {
    const activeStatuses = new Set(["active", "probation", "onboarding"]);
    const totalActive = employees.filter((e) =>
      activeStatuses.has(e.employmentStatus.toLowerCase())
    ).length;
    const onsite = employees.filter((e) => e.workMode === "onsite").length;
    const hybrid = employees.filter((e) => e.workMode === "hybrid").length;
    const remote = employees.filter((e) => e.workMode === "remote" || e.workMode === "wfh").length;

    return { totalActive, onsite, hybrid, remote };
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((emp) => {
      if (modeFilter !== "All" && emp.workMode !== modeFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return (
        emp.fullName.toLowerCase().includes(q) ||
        emp.jobTitle.toLowerCase().includes(q) ||
        (emp.email?.toLowerCase().includes(q) ?? false) ||
        (emp.departmentName?.toLowerCase().includes(q) ?? false) ||
        emp.branchName.toLowerCase().includes(q)
      );
    });
  }, [employees, searchQuery, modeFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeroHeader
        eyebrow="Organization"
        title="Employees"
        subtitle="Manage active team members, work setups, compensation, and geofence settings"
        actions={
          <span className="inline-flex w-fit items-center rounded-full border border-indigo-100 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-[#1E1B4B] shadow-xs backdrop-blur-md">
            {employees.length} {employees.length === 1 ? "member" : "members"}
          </span>
        }
      />

      {/* 4-Card KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <GlassStatTile
          icon={<Users className="h-5 w-5" />}
          label="Total Active"
          value={kpis.totalActive}
        />
        <GlassStatTile
          icon={<Building2 className="h-5 w-5" />}
          label="Onsite"
          value={kpis.onsite}
        />
        <GlassStatTile
          icon={<Laptop className="h-5 w-5" />}
          label="Hybrid"
          value={kpis.hybrid}
        />
        <GlassStatTile
          icon={<Home className="h-5 w-5" />}
          label="Remote"
          value={kpis.remote}
        />
      </div>

      {/* Search & Work-Mode Filter Bar (Frosted Glass) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100/80 bg-white/75 p-3.5 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, role, email, or branch..."
            className="w-full rounded-xl border border-indigo-100 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1E1B4B] focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/15"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_OPTIONS.map((option) => {
            const active = modeFilter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setModeFilter(option)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#1E1B4B] text-white shadow-xs"
                    : "border border-slate-200/80 bg-white text-slate-600 hover:text-[#1E1B4B]"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {/* Directory Grid */}
      {employees.length === 0 ? (
        <SolidSurfaceCard className="border-dashed p-10 text-center">
          <p className="text-sm font-medium text-[#1E1B4B]">No employees yet</p>
          <p className="mt-1 text-xs text-slate-600">
            Employees are added automatically when you hire applicants.
          </p>
        </SolidSurfaceCard>
      ) : filteredEmployees.length === 0 ? (
        <SolidSurfaceCard className="border-dashed p-10 text-center">
          <p className="text-sm font-medium text-[#1E1B4B]">No matching employees</p>
          <p className="mt-1 text-xs text-slate-600">
            Try clearing your search or switching work mode filters.
          </p>
        </SolidSurfaceCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:border-[#1E1B4B]/40 hover:shadow-md"
            >
              <div className="space-y-4">
                {/* Top row: Avatar + Name/Role + Pills */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-700">
                      {emp.initials}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-slate-900">
                        {emp.fullName}
                      </h2>
                      <p className="truncate text-xs text-slate-600">
                        {emp.jobTitle}
                        {emp.departmentName ? ` · ${emp.departmentName}` : ""}
                      </p>
                      {emp.email && (
                        <p className="truncate text-xs text-slate-500">{emp.email}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status & Work Mode Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${getStatusBadgeClasses(
                      emp.employmentStatus
                    )}`}
                  >
                    {emp.employmentStatus.replace("_", " ")}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getWorkModeBadgeClasses(
                      emp.workMode
                    )}`}
                  >
                    Work Setup: {emp.workSetupLabel ?? emp.workMode}
                  </span>
                </div>

                {/* Metadata rows */}
                <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Assigned Branch</span>
                    {emp.branchNeedsSetup ? (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        {emp.branchName}
                      </span>
                    ) : (
                      <span className="truncate font-medium text-slate-900">
                        {emp.branchName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Monthly Salary</span>
                    <span className="font-semibold text-slate-900">
                      ₱{emp.monthlySalary.toLocaleString("en-PH")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Start Date</span>
                    <span className="font-medium text-slate-900">
                      {emp.startDate
                        ? new Date(emp.startDate).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                {emp.pendingWfhRequest ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-[11px] text-amber-950 space-y-2">
                    <p className="font-semibold line-clamp-2">
                      WFH Request: {emp.pendingWfhRequest.address}
                    </p>
                    {emp.pendingWfhRequest.reason ? (
                      <p className="text-amber-800 line-clamp-1">
                        Reason: {emp.pendingWfhRequest.reason}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleReviewWfh(emp.id, "approve")}
                        className="flex-1 rounded-lg bg-[#1E1B4B] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1E1B4B]/90 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleReviewWfh(emp.id, "reject")}
                        className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null}
                <Link
                  href={`/hr/employees/${emp.id}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#1E1B4B]/20 bg-white px-3 py-2 text-xs font-semibold text-[#1E1B4B] transition-colors hover:bg-[#1E1B4B] hover:text-white"
                >
                  Manage Profile &amp; Geofence
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
