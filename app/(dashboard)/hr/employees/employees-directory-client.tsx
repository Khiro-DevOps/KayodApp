"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface DirectoryEmployee {
  id: string;
  fullName: string;
  initials: string;
  jobTitle: string;
  departmentName: string | null;
  email: string | null;
  employmentStatus: string;
  workMode: "onsite" | "hybrid" | "remote";
  branchName: string;
  monthlySalary: number;
  startDate: string | null;
}

type WorkModeFilter = "All" | "Onsite" | "Hybrid" | "Remote";

const FILTER_OPTIONS: WorkModeFilter[] = ["All", "Onsite", "Hybrid", "Remote"];

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
  if (mode === "remote") {
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function EmployeesDirectoryClient({
  employees,
}: {
  employees: DirectoryEmployee[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<WorkModeFilter>("All");

  const kpis = useMemo(() => {
    const activeStatuses = new Set(["active", "probation", "onboarding"]);
    const totalActive = employees.filter((e) =>
      activeStatuses.has(e.employmentStatus.toLowerCase())
    ).length;
    const onsite = employees.filter((e) => e.workMode === "onsite").length;
    const hybrid = employees.filter((e) => e.workMode === "hybrid").length;
    const remote = employees.filter((e) => e.workMode === "remote").length;

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
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Employees
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage active team members, work modes, compensation, and geofence settings
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
          {employees.length} {employees.length === 1 ? "member" : "members"}
        </span>
      </div>

      {/* 4-Card KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-600">Total Active</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpis.totalActive}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-600">Onsite</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpis.onsite}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-600">Hybrid</p>
          <p className="mt-1 text-2xl font-bold text-purple-600">{kpis.hybrid}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-600">Remote</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpis.remote}</p>
        </div>
      </div>

      {/* Search & Work-Mode Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600/15"
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
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
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
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-900">No employees yet</p>
          <p className="mt-1 text-xs text-slate-600">
            Employees are added automatically when you hire applicants.
          </p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-900">No matching employees</p>
          <p className="mt-1 text-xs text-slate-600">
            Try clearing your search or switching work mode filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
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
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${getWorkModeBadgeClasses(
                      emp.workMode
                    )}`}
                  >
                    {emp.workMode}
                  </span>
                </div>

                {/* Metadata rows */}
                <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Assigned Branch</span>
                    <span className="truncate font-medium text-slate-900">
                      {emp.branchName}
                    </span>
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

              <div className="mt-4 border-t border-slate-100 pt-3">
                <Link
                  href={`/hr/employees/${emp.id}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-purple-600 transition-colors hover:border-purple-200 hover:bg-purple-50"
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
