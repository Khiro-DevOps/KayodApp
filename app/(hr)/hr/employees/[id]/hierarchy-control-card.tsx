"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import {
  JOB_LEVEL_LABELS,
  type JobLevel,
} from "@/lib/rbac/permissions";
import {
  getJobLevelBadgeClasses,
  normalizeJobLevel,
  requiresDirectReportsReassignment,
  type SupervisorCandidate,
} from "@/lib/workforce-hierarchy";
import { updateEmployeeHierarchyAction } from "./employee-hierarchy-actions";

interface HierarchyControlCardProps {
  employeeId: string;
  employeeName: string;
  initialJobLevel: JobLevel;
  initialReportsTo: string | null;
  initialEmploymentStatus: string;
  activeDirectReportsCount: number;
  supervisorCandidates: SupervisorCandidate[];
  canManage: boolean;
}

const JOB_LEVEL_OPTIONS: JobLevel[] = [
  "staff",
  "team_lead",
  "supervisor",
  "manager",
];

const EMPLOYMENT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "on_leave", label: "On Leave" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
  { value: "separated", label: "Separated" },
  { value: "terminated", label: "Terminated" },
];

export default function HierarchyControlCard({
  employeeId,
  employeeName,
  initialJobLevel,
  initialReportsTo,
  initialEmploymentStatus,
  activeDirectReportsCount,
  supervisorCandidates,
  canManage,
}: HierarchyControlCardProps) {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  const [jobLevel, setJobLevel] = useState<JobLevel>(
    normalizeJobLevel(initialJobLevel),
  );
  const [reportsTo, setReportsTo] = useState<string>(initialReportsTo ?? "");
  const [employmentStatus, setEmploymentStatus] = useState<string>(
    initialEmploymentStatus || "active",
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [showReassignWarningModal, setShowReassignWarningModal] =
    useState<boolean>(false);

  useEffect(() => {
    setJobLevel(normalizeJobLevel(initialJobLevel));
  }, [initialJobLevel]);

  useEffect(() => {
    setReportsTo(initialReportsTo ?? "");
  }, [initialReportsTo]);

  useEffect(() => {
    setEmploymentStatus(initialEmploymentStatus || "active");
  }, [initialEmploymentStatus]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedSupervisor = useMemo(
    () => supervisorCandidates.find((c) => c.id === reportsTo) ?? null,
    [supervisorCandidates, reportsTo],
  );

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return supervisorCandidates;
    return supervisorCandidates.filter((c) => {
      const levelLabel = JOB_LEVEL_LABELS[c.job_level].toLowerCase();
      return (
        c.full_name.toLowerCase().includes(q) ||
        c.job_title.toLowerCase().includes(q) ||
        levelLabel.includes(q) ||
        (c.department_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [supervisorCandidates, searchQuery]);

  const needsReassignmentWarning = requiresDirectReportsReassignment(
    employmentStatus,
    activeDirectReportsCount,
  );

  const submitChanges = (confirmReassignment: boolean) => {
    const formData = new FormData();
    formData.set("employee_id", employeeId);
    formData.set("job_level", jobLevel);
    formData.set("reports_to", reportsTo);
    formData.set("employment_status", employmentStatus);
    if (confirmReassignment) {
      formData.set("confirm_reassignment", "true");
    }

    startTransition(async () => {
      const res = await updateEmployeeHierarchyAction(formData);
      if (!res.ok) {
        if (res.requiresReassignmentWarning) {
          setShowReassignWarningModal(true);
        }
        toast.error(res.error ?? "Failed to update hierarchy settings.");
        return;
      }
      setShowReassignWarningModal(false);
      toast.success("Role level, reporting line, and status updated.");
      router.refresh();
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canManage) return;

    if (needsReassignmentWarning) {
      setShowReassignWarningModal(true);
      return;
    }

    submitChanges(false);
  };

  return (
    <section className="rounded-2xl border border-[#e6e4f0] bg-white p-6 shadow-xs space-y-5">
      <div className="flex flex-col gap-2 border-b border-[#e6e4f0] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-[#171542]">
            Organization Hierarchy &amp; Status
          </h2>
          <p className="text-xs text-[#5d5a75]">
            Assign job level, reporting supervisor/team lead, and employment status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${getJobLevelBadgeClasses(
              jobLevel,
            )}`}
          >
            {JOB_LEVEL_LABELS[jobLevel]}
          </span>
          {activeDirectReportsCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-[#1E1B4B]">
              <Users className="h-3.5 w-3.5" />
              {activeDirectReportsCount} direct{" "}
              {activeDirectReportsCount === 1 ? "report" : "reports"}
            </span>
          ) : null}
          {!canManage ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
              Read-only
            </span>
          ) : null}
        </div>
      </div>

      {needsReassignmentWarning ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold">
              Direct Reports Reassignment Required
            </p>
            <p className="text-amber-900">
              {employeeName} currently has{" "}
              <span className="font-semibold">{activeDirectReportsCount}</span>{" "}
              active direct{" "}
              {activeDirectReportsCount === 1 ? "report" : "reports"}. Please
              reassign their direct reports to another active Team Lead or
              Supervisor before changing their status to{" "}
              <span className="font-semibold capitalize">{employmentStatus}</span>.
            </p>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Job Level Selector */}
          <div className="space-y-1.5">
            <label
              htmlFor="hierarchy-job-level"
              className="block text-xs font-semibold text-[#171542]"
            >
              Job Level
            </label>
            <select
              id="hierarchy-job-level"
              name="job_level"
              disabled={!canManage || isPending}
              value={jobLevel}
              onChange={(e) => setJobLevel(normalizeJobLevel(e.target.value))}
              className="w-full rounded-xl border border-[#e6e4f0] bg-[#fcfbfe] px-3 py-2.5 text-sm text-[#171542] focus:border-[#1E1B4B] focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {JOB_LEVEL_OPTIONS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl === "manager" ? "Department Manager" : JOB_LEVEL_LABELS[lvl]}
                </option>
              ))}
            </select>
          </div>

          {/* Searchable Reports To Dropdown */}
          <div className="space-y-1.5" ref={dropdownRef}>
            <label className="block text-xs font-semibold text-[#171542]">
              Reports To (Team Lead / Supervisor)
            </label>
            <div className="relative">
              <button
                type="button"
                disabled={!canManage || isPending}
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#e6e4f0] bg-[#fcfbfe] px-3 py-2.5 text-left text-sm text-[#171542] transition-colors hover:border-[#1E1B4B]/40 focus:border-[#1E1B4B] focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="truncate">
                  {selectedSupervisor ? (
                    <span className="flex items-center gap-2 truncate">
                      <UserCheck className="h-4 w-4 shrink-0 text-[#1E1B4B]" />
                      <span className="truncate font-medium">
                        {selectedSupervisor.full_name}
                      </span>
                      <span className="shrink-0 text-xs text-[#5d5a75]">
                        ({JOB_LEVEL_LABELS[selectedSupervisor.job_level]})
                      </span>
                    </span>
                  ) : (
                    <span className="text-[#5d5a75]">
                      None (No direct supervisor)
                    </span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#5d5a75]" />
              </button>

              {dropdownOpen ? (
                <div className="absolute left-0 right-0 z-30 mt-1.5 rounded-2xl border border-[#e6e4f0] bg-white p-2 shadow-xl">
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d5a75]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name, role, level, or dept..."
                      className="w-full rounded-xl border border-[#e6e4f0] bg-[#fcfbfe] py-1.5 pl-8 pr-7 text-xs text-[#171542] placeholder:text-[#5d5a75]/70 focus:border-[#1E1B4B] focus:outline-none"
                      autoFocus
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5d5a75] hover:text-[#171542]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setReportsTo("");
                        setDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                        reportsTo === ""
                          ? "bg-[#EDE9F9] font-semibold text-[#1E1B4B]"
                          : "text-[#5d5a75] hover:bg-[#fcfbfe]"
                      }`}
                    >
                      <span>None (No direct supervisor)</span>
                      {reportsTo === "" ? (
                        <Check className="h-3.5 w-3.5 text-[#1E1B4B]" />
                      ) : null}
                    </button>

                    {filteredCandidates.length === 0 ? (
                      <p className="px-3 py-3 text-center text-xs text-[#5d5a75]">
                        No matching active employees found.
                      </p>
                    ) : (
                      filteredCandidates.map((candidate) => {
                        const isSelected = candidate.id === reportsTo;
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => {
                              setReportsTo(candidate.id);
                              setDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? "bg-[#EDE9F9] text-[#1E1B4B]"
                                : "hover:bg-[#fcfbfe] text-[#171542]"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-semibold">
                                  {candidate.full_name}
                                </span>
                                <span
                                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${getJobLevelBadgeClasses(
                                    candidate.job_level,
                                  )}`}
                                >
                                  {JOB_LEVEL_LABELS[candidate.job_level]}
                                </span>
                              </div>
                              <p className="truncate text-[11px] text-[#5d5a75]">
                                {candidate.job_title}
                                {candidate.department_name
                                  ? ` · ${candidate.department_name}`
                                  : ""}
                              </p>
                            </div>
                            {isSelected ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-[#1E1B4B]" />
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Employment Status Selector */}
          <div className="space-y-1.5">
            <label
              htmlFor="hierarchy-employment-status"
              className="block text-xs font-semibold text-[#171542]"
            >
              Employment Status
            </label>
            <select
              id="hierarchy-employment-status"
              name="employment_status"
              disabled={!canManage || isPending}
              value={employmentStatus}
              onChange={(e) => setEmploymentStatus(e.target.value)}
              className="w-full rounded-xl border border-[#e6e4f0] bg-[#fcfbfe] px-3 py-2.5 text-sm text-[#171542] focus:border-[#1E1B4B] focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {EMPLOYMENT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {canManage ? (
          <div className="flex items-center justify-end border-t border-[#e6e4f0] pt-4">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1E1B4B]/90 disabled:opacity-50"
            >
              {isPending ? "Saving Hierarchy..." : "Save Hierarchy & Status"}
            </button>
          </div>
        ) : null}
      </form>

      {showReassignWarningModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#171542]">
                  Reassign Direct Reports First
                </h3>
                <p className="text-xs leading-relaxed text-[#5d5a75]">
                  <span className="font-semibold text-[#171542]">
                    {employeeName}
                  </span>{" "}
                  currently supervises{" "}
                  <span className="font-semibold text-amber-800">
                    {activeDirectReportsCount} active direct{" "}
                    {activeDirectReportsCount === 1 ? "report" : "reports"}
                  </span>
                  . Changing their status to{" "}
                  <span className="font-semibold capitalize">
                    {employmentStatus}
                  </span>{" "}
                  will leave those employees without an active supervisor until
                  reassigned.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setShowReassignWarningModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel &amp; Reassign First
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => submitChanges(true)}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Confirm Status Change"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
