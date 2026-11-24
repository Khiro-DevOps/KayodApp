"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getPromoteModalContext,
  promoteApplicantToEmployee,
} from "@/app/actions/promotion";
import {
  filterAndSortSupervisorCandidates,
  JOB_LEVEL_LABELS,
  normalizeJobLevel,
  type JobLevel,
  type SupervisorCandidate,
} from "@/lib/workforce-hierarchy";

interface PromoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (employeeId: string) => void;
  applicationId: string;
  candidateName: string;
  candidateEmail?: string;
  jobTitle: string;
  salary: number;
  workLocationName?: string;
  workMode?: string;
  shiftStart?: string;
  shiftEnd?: string;
  probationEndDate?: string;
  defaultSupervisorId?: string | null;
  targetJobLevel?: JobLevel | null;
  departmentId?: string | null;
  tenantId?: string | null;
  supervisorCandidates?: SupervisorCandidate[];
}

export default function PromoteCandidateModal({
  isOpen,
  onClose,
  onSuccess,
  applicationId,
  candidateName,
  candidateEmail,
  jobTitle,
  salary,
  workLocationName = "Office Branch",
  workMode = "onsite",
  shiftStart = "08:00:00",
  shiftEnd = "17:00:00",
  probationEndDate,
  defaultSupervisorId: propDefaultSupervisorId,
  targetJobLevel: propTargetJobLevel,
  departmentId: propDepartmentId,
  tenantId: propTenantId,
  supervisorCandidates: propSupervisorCandidates,
}: PromoteModalProps) {
  const [isPromoting, setIsPromoting] = useState(false);
  const [candidates, setCandidates] = useState<SupervisorCandidate[]>(
    propSupervisorCandidates ?? []
  );
  const [departmentId, setDepartmentId] = useState<string | null>(
    propDepartmentId ?? null
  );
  const [tenantId, setTenantId] = useState<string | null>(propTenantId ?? null);
  const [selectedReportsTo, setSelectedReportsTo] = useState<string>(
    propDefaultSupervisorId ?? ""
  );
  const [selectedJobLevel, setSelectedJobLevel] = useState<JobLevel>(() =>
    normalizeJobLevel(propTargetJobLevel)
  );
  const [isLoadingSupervisors, setIsLoadingSupervisors] = useState(false);

  useEffect(() => {
    if (propSupervisorCandidates) {
      setCandidates(propSupervisorCandidates);
    }
    if (propDepartmentId !== undefined) {
      setDepartmentId(propDepartmentId ?? null);
    }
    if (propTenantId !== undefined) {
      setTenantId(propTenantId ?? null);
    }
    if (propDefaultSupervisorId !== undefined) {
      setSelectedReportsTo(propDefaultSupervisorId ?? "");
    }
    if (propTargetJobLevel !== undefined) {
      setSelectedJobLevel(normalizeJobLevel(propTargetJobLevel));
    }
  }, [
    propSupervisorCandidates,
    propDepartmentId,
    propTenantId,
    propDefaultSupervisorId,
    propTargetJobLevel,
  ]);

  useEffect(() => {
    if (!isOpen || propSupervisorCandidates !== undefined) return;
    let active = true;
    setIsLoadingSupervisors(true);
    void getPromoteModalContext(applicationId)
      .then((ctx) => {
        if (!active) return;
        setCandidates(ctx.supervisorCandidates);
        setDepartmentId(ctx.departmentId);
        setTenantId(ctx.tenantId);
        setSelectedJobLevel(ctx.targetJobLevel);
        setSelectedReportsTo((prev) => prev || ctx.defaultSupervisorId || "");
      })
      .catch(() => {
        // Non-blocking fallback
      })
      .finally(() => {
        if (active) setIsLoadingSupervisors(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, applicationId, propSupervisorCandidates]);

  const sortedSupervisors = useMemo(
    () =>
      filterAndSortSupervisorCandidates(candidates, {
        currentEmployeeId: "",
        tenantId,
        departmentId,
      }),
    [candidates, tenantId, departmentId]
  );

  if (!isOpen) return null;

  // Calculate estimated probation end date if not provided (6 months from today)
  const estimatedProbation = probationEndDate || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  })();

  const formattedSalary = salary > 0 
    ? `₱${salary.toLocaleString("en-PH", { minimumFractionDigits: 2 })} / month` 
    : "₱0.00 (Will be fetched from accepted offer)";

  const handlePromote = async () => {
    setIsPromoting(true);
    try {
      const res = await promoteApplicantToEmployee(applicationId, {
        reportsTo: selectedReportsTo || null,
        jobLevel: selectedJobLevel,
      });
      if (!res.success) {
        toast.error(res.error || "Failed to promote candidate to employee");
        return;
      }

      toast.success(`🎉 ${candidateName} has been successfully promoted to Employee (Onboarding)!`);
      if (onSuccess && res.employeeId) {
        onSuccess(res.employeeId);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred during promotion");
    } finally {
      setIsPromoting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card-bg p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              Contract Verified & Signed
            </span>
            <h2 className="text-xl font-bold text-text-main">Promote Candidate to Employee</h2>
            <p className="text-xs text-text-muted">
              Review carried-over parameters before creating the employee record.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isPromoting}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-bg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Preview Details */}
        <div className="space-y-4 rounded-xl border border-border/80 bg-surface-bg/50 p-4">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-medium text-text-muted">Candidate Name</p>
              <p className="text-sm font-semibold text-text-main">{candidateName}</p>
              {candidateEmail && <p className="text-text-muted">{candidateEmail}</p>}
            </div>
            <div>
              <p className="font-medium text-text-muted">Job Title</p>
              <p className="text-sm font-semibold text-text-main">{jobTitle}</p>
            </div>
            <div>
              <p className="font-medium text-text-muted">Monthly Salary</p>
              <p className="text-sm font-bold text-emerald-600">{formattedSalary}</p>
            </div>
            <div>
              <p className="font-medium text-text-muted">Work Mode</p>
              <p className="text-sm font-semibold text-text-main capitalize">{workMode}</p>
            </div>
            <div>
              <p className="font-medium text-text-muted">Assigned Location</p>
              <p className="text-sm font-medium text-text-main truncate">{workLocationName}</p>
            </div>
            <div>
              <p className="font-medium text-text-muted">Shift Schedule</p>
              <p className="text-sm font-medium text-text-main">{shiftStart.slice(0,5)} - {shiftEnd.slice(0,5)} (Mon - Fri)</p>
            </div>
            <div className="col-span-2 border-t border-border/40 pt-2">
              <p className="font-medium text-text-muted">Probation Timeline (6 Months)</p>
              <p className="text-sm font-medium text-text-main">Start: Today • End Date: {estimatedProbation}</p>
            </div>
          </div>
        </div>

        {/* Job Level & Direct Supervisor / Team Lead */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="promote_job_level" className="block text-xs font-semibold text-text-main">
              Job Level
            </label>
            <select
              id="promote_job_level"
              value={selectedJobLevel}
              onChange={(e) => setSelectedJobLevel(normalizeJobLevel(e.target.value))}
              disabled={isPromoting || isLoadingSupervisors}
              className="w-full rounded-xl border border-border bg-card-bg px-3 py-2.5 text-xs text-text-main outline-none focus:border-primary"
            >
              {(["staff", "team_lead", "supervisor", "manager"] as const).map((level) => (
                <option key={level} value={level}>
                  {JOB_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="promote_reports_to" className="block text-xs font-semibold text-text-main">
              Direct Supervisor / Team Lead
            </label>
            <select
              id="promote_reports_to"
              value={selectedReportsTo}
              onChange={(e) => setSelectedReportsTo(e.target.value)}
              disabled={isPromoting || isLoadingSupervisors}
              className="w-full rounded-xl border border-border bg-card-bg px-3 py-2.5 text-xs text-text-main outline-none focus:border-primary"
            >
              <option value="">
                {isLoadingSupervisors ? "Loading supervisors..." : "No direct supervisor assigned"}
              </option>
              {sortedSupervisors.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.full_name} — {JOB_LEVEL_LABELS[candidate.job_level]} ({candidate.job_title})
                  {candidate.department_name ? ` · ${candidate.department_name}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPromoting}
            className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-text-main hover:bg-surface-bg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePromote}
            disabled={isPromoting}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isPromoting ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Promoting...</span>
              </>
            ) : (
              <span>Confirm & Promote to Employee</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
