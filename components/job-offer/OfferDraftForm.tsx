"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createHydratedOfferDraft,
  declineOfferNegotiationAction,
  getOfferHierarchyContext,
  submitRecruiterOfferRecommendationAction,
  updateOfferDraft,
  sendDraftOffer,
  type RecruiterOfferRecommendation,
} from "@/app/(auth)/actions/offer-actions";
import PhilippineCompensationChecklist from "@/components/jobs/PhilippineCompensationChecklist";
import {
  computeCompensationTotals,
  parseCompensationPackage,
  type PhilippineCompensationPackage,
} from "@/lib/compensation-package";
import {
  filterAndSortSupervisorCandidates,
  formatSupervisorDisplayLabel,
  JOB_LEVEL_LABELS,
  normalizeJobLevel,
  type JobLevel,
  type SupervisorCandidate,
} from "@/lib/workforce-hierarchy";
import {
  buildWorkScheduleSummary,
  clampWorkDaysPerWeek,
  formatRestDaysPolicyLabel,
  formatScheduleTime12h,
  formatScheduleTypeLabel,
  formatShiftRotationPatternLabel,
  normalizeRestDaysPolicy,
  normalizeScheduleType,
  normalizeShiftRotationPattern,
  REST_DAYS_POLICY_OPTIONS,
  SHIFT_ROTATION_PATTERN_OPTIONS,
  type RestDaysPolicy,
  type ScheduleType,
  type ShiftRotationPattern,
} from "@/lib/schedule-policy";

export interface OfficeBranchItem {
  id: string;
  name: string;
  address?: string | null;
}

export interface OfferDraftRecord {
  id: string;
  application_id: string;
  job_id?: string | null;
  status: string;
  salary?: number | string | null;
  start_date?: string | null;
  work_setup?: string | null;
  work_mode?: string | null;
  work_location_id?: string | null;
  department?: string | null;
  probation_days?: number | string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  work_days?: string[] | null;
  financial_package?: Record<string, unknown> | null;
  job_metadata?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface OfferDraftFormProps {
  applicationId: string;
  jobId: string;
  candidateName: string;
  jobTitle: string;
  initialOffer: OfferDraftRecord | null;
  branches?: OfficeBranchItem[];
  defaultWorkSetup?: string | null;
  defaultWorkLocationId?: string | null;
  onClose?: () => void;
  onSent?: (offerId: string) => void;
}

const STANDARD_WORK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatBenefitsValue(offer: OfferDraftRecord | null): string {
  const meta = (offer?.job_metadata ?? offer?.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.benefits;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean).join(", ");
  }
  if (typeof raw === "string") {
    return raw;
  }
  return "";
}

function readPackageNumber(
  offer: OfferDraftRecord | null,
  key: "monthly_allowance" | "attendance_incentive"
): string {
  const pkg = (offer?.financial_package ?? {}) as Record<string, unknown>;
  const meta = (offer?.job_metadata ?? offer?.metadata ?? {}) as Record<string, unknown>;
  const raw = pkg[key] ?? meta[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "0";
}

export default function OfferDraftForm({
  applicationId,
  jobId,
  candidateName,
  jobTitle,
  initialOffer,
  branches = [],
  defaultWorkSetup,
  defaultWorkLocationId,
  onClose,
  onSent,
}: OfferDraftFormProps) {
  const router = useRouter();
  const [offer, setOffer] = useState<OfferDraftRecord | null>(initialOffer);
  const [startingDraft, setStartingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [salary, setSalary] = useState<string>(String(initialOffer?.salary ?? 0));
  const [monthlyAllowance, setMonthlyAllowance] = useState<string>(
    readPackageNumber(initialOffer, "monthly_allowance")
  );
  const [attendanceIncentive, setAttendanceIncentive] = useState<string>(
    readPackageNumber(initialOffer, "attendance_incentive")
  );
  const [startDate, setStartDate] = useState<string>(initialOffer?.start_date ?? "");
  const [workSetup, setWorkSetup] = useState<string>(
    initialOffer?.work_setup ?? initialOffer?.work_mode ?? defaultWorkSetup ?? "onsite"
  );
  const [workLocationId, setWorkLocationId] = useState<string>(
    initialOffer?.work_location_id ?? defaultWorkLocationId ?? ""
  );
  const [department, setDepartment] = useState<string>(initialOffer?.department ?? "");
  const [probationDays, setProbationDays] = useState<string>(
    String(initialOffer?.probation_days ?? 180)
  );
  const [shiftStart, setShiftStart] = useState<string>(initialOffer?.shift_start ?? "08:00");
  const [shiftEnd, setShiftEnd] = useState<string>(initialOffer?.shift_end ?? "17:00");
  const [workDays, setWorkDays] = useState<string[]>(
    Array.isArray(initialOffer?.work_days) ? initialOffer.work_days : []
  );
  const initialMeta = (initialOffer?.job_metadata ?? initialOffer?.metadata ?? {}) as Record<string, unknown>;
  const [scheduleType, setScheduleType] = useState<ScheduleType>(() =>
    normalizeScheduleType(initialMeta.schedule_type)
  );
  const [workDaysPerWeek, setWorkDaysPerWeek] = useState<string>(() =>
    String(
      clampWorkDaysPerWeek(
        initialMeta.work_days_per_week,
        Array.isArray(initialOffer?.work_days) && initialOffer.work_days.length > 0
          ? initialOffer.work_days.length
          : 5
      )
    )
  );
  const [restDaysPolicy, setRestDaysPolicy] = useState<RestDaysPolicy>(() =>
    normalizeRestDaysPolicy(
      initialMeta.rest_days_policy,
      normalizeScheduleType(initialMeta.schedule_type)
    )
  );
  const [shiftRotationPattern, setShiftRotationPattern] = useState<ShiftRotationPattern>(() =>
    normalizeShiftRotationPattern(
      initialMeta.shift_rotation_pattern,
      normalizeScheduleType(initialMeta.schedule_type)
    )
  );
  const [benefits, setBenefits] = useState<string>(formatBenefitsValue(initialOffer));
  const [targetJobLevel, setTargetJobLevel] = useState<JobLevel>(() =>
    normalizeJobLevel(
      typeof initialMeta.target_job_level === "string" ? initialMeta.target_job_level : undefined
    )
  );
  const [reportsToEmployeeId, setReportsToEmployeeId] = useState<string>(() =>
    typeof initialMeta.reports_to_employee_id === "string"
      ? initialMeta.reports_to_employee_id
      : ""
  );
  const [reportsToFallbackLabel, setReportsToFallbackLabel] = useState<string>(() =>
    typeof initialMeta.reports_to_label === "string"
      ? initialMeta.reports_to_label
      : typeof initialMeta.reports_to === "string"
        ? initialMeta.reports_to
        : ""
  );
  const [supervisorCandidates, setSupervisorCandidates] = useState<SupervisorCandidate[]>([]);
  const [hierarchyDeptId, setHierarchyDeptId] = useState<string | null>(null);
  const [hierarchyTenantId, setHierarchyTenantId] = useState<string | null>(null);
  const [canSendStandardOffer, setCanSendStandardOffer] = useState<boolean>(true);
  const [canApproveAndSendOffers, setCanApproveAndSendOffers] = useState<boolean>(true);
  const [canSubmitRecommendation, setCanSubmitRecommendation] = useState<boolean>(false);
  const [recSalaryInput, setRecSalaryInput] = useState<string>(() => {
    const rec = initialMeta.recruiter_recommendation as RecruiterOfferRecommendation | undefined;
    return rec?.recommended_base_salary ? String(rec.recommended_base_salary) : "";
  });
  const [recJustification, setRecJustification] = useState<string>(() => {
    const rec = initialMeta.recruiter_recommendation as RecruiterOfferRecommendation | undefined;
    return rec?.justification ?? "";
  });
  const [submittingRec, setSubmittingRec] = useState<boolean>(false);
  const [showDeclineBox, setShowDeclineBox] = useState<boolean>(false);
  const [declineNote, setDeclineNote] = useState<string>("");
  const [decliningNegotiation, setDecliningNegotiation] = useState<boolean>(false);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    void getOfferHierarchyContext(jobId)
      .then((ctx) => {
        if (!active) return;
        setSupervisorCandidates(ctx.supervisorCandidates);
        setHierarchyDeptId(ctx.departmentId);
        setHierarchyTenantId(ctx.tenantId);
        setTargetJobLevel(ctx.targetJobLevel);
        setCanSendStandardOffer(ctx.canSendStandardOffer);
        setCanApproveAndSendOffers(ctx.canApproveAndSendOffers);
        setCanSubmitRecommendation(ctx.canSubmitRecommendation);
        setReportsToEmployeeId((prev) => prev || ctx.defaultSupervisorId || "");
        if (ctx.expectedStartDate) {
          setStartDate((prev) => prev || ctx.expectedStartDate || "");
        }
        if (ctx.department) {
          setDepartment((prev) => prev || ctx.department || "");
        }
        if (ctx.probationDays != null) {
          setProbationDays((prev) => prev || String(ctx.probationDays));
        }
        if (typeof initialMeta.schedule_type !== "string" && ctx.scheduleType) {
          setScheduleType(ctx.scheduleType);
        }
        if (initialMeta.work_days_per_week == null && ctx.workDaysPerWeek) {
          setWorkDaysPerWeek(String(ctx.workDaysPerWeek));
        }
        if (typeof initialMeta.rest_days_policy !== "string" && ctx.restDaysPolicy) {
          setRestDaysPolicy(ctx.restDaysPolicy);
        }
        if (typeof initialMeta.shift_rotation_pattern !== "string" && ctx.shiftRotationPattern) {
          setShiftRotationPattern(ctx.shiftRotationPattern);
        }
        if (!initialOffer?.shift_start && ctx.shiftStart) {
          setShiftStart((prev) => prev || ctx.shiftStart);
        }
        if (!initialOffer?.shift_end && ctx.shiftEnd) {
          setShiftEnd((prev) => prev || ctx.shiftEnd);
        }
        if ((!initialOffer?.work_days || initialOffer.work_days.length === 0) && ctx.workDays?.length) {
          setWorkDays((prev) => (prev.length > 0 ? prev : ctx.workDays));
        }
        const fallbackSup =
          ctx.defaultSupervisorLabel ||
          (ctx.supervisorName
            ? ctx.supervisorTitle
              ? `${ctx.supervisorName} — ${ctx.supervisorTitle}`
              : ctx.supervisorName
            : "");
        if (fallbackSup) {
          setReportsToFallbackLabel((prev) => prev || fallbackSup);
        }
      })
      .catch(() => {
        // Non-blocking fallback
      });
    return () => {
      active = false;
    };
  }, [jobId]);

  const sortedSupervisorOptions = useMemo(
    () =>
      filterAndSortSupervisorCandidates(supervisorCandidates, {
        currentEmployeeId: "",
        tenantId: hierarchyTenantId,
        departmentId: hierarchyDeptId,
      }),
    [supervisorCandidates, hierarchyTenantId, hierarchyDeptId]
  );

  const resolvedReportsToLabel = useMemo(() => {
    if (reportsToEmployeeId) {
      const match = sortedSupervisorOptions.find((c) => c.id === reportsToEmployeeId);
      if (match) return formatSupervisorDisplayLabel(match);
    }
    return reportsToFallbackLabel;
  }, [reportsToEmployeeId, sortedSupervisorOptions, reportsToFallbackLabel]);

  const [compensationPackage, setCompensationPackage] = useState<PhilippineCompensationPackage>(() => {
    const pkg = (initialOffer?.financial_package ?? {}) as Record<string, unknown>;
    const meta = (initialOffer?.job_metadata ?? initialOffer?.metadata ?? {}) as Record<string, unknown>;
    return parseCompensationPackage(pkg.compensation_package ?? meta.compensation_package, {
      ...meta,
      ...pkg,
    });
  });

  const handleCompensationPackageChange = (nextPkg: PhilippineCompensationPackage) => {
    setCompensationPackage(nextPkg);
    const totals = computeCompensationTotals(nextPkg, Number(salary) || 0);
    setMonthlyAllowance(String(totals.monthlyAllowancesTotal));
    setAttendanceIncentive(String(totals.attendanceIncentiveAmount));
    setBenefits(totals.selectedBenefitLabels.join(", "));
  };

  const syncFormFromOffer = (nextOffer: OfferDraftRecord) => {
    setOffer(nextOffer);
    setSalary(String(nextOffer.salary ?? 0));
    setMonthlyAllowance(readPackageNumber(nextOffer, "monthly_allowance"));
    setAttendanceIncentive(readPackageNumber(nextOffer, "attendance_incentive"));
    setStartDate(nextOffer.start_date ?? "");
    setWorkSetup(nextOffer.work_setup ?? nextOffer.work_mode ?? defaultWorkSetup ?? "onsite");
    setWorkLocationId(nextOffer.work_location_id ?? defaultWorkLocationId ?? "");
    setDepartment(nextOffer.department ?? "");
    setProbationDays(String(nextOffer.probation_days ?? 180));
    setShiftStart(nextOffer.shift_start ?? "");
    setShiftEnd(nextOffer.shift_end ?? "");
    setWorkDays(Array.isArray(nextOffer.work_days) ? nextOffer.work_days : []);
    setBenefits(formatBenefitsValue(nextOffer));
    const pkg = (nextOffer.financial_package ?? {}) as Record<string, unknown>;
    const meta = (nextOffer.job_metadata ?? nextOffer.metadata ?? {}) as Record<string, unknown>;
    const nextScheduleType = normalizeScheduleType(meta.schedule_type);
    setScheduleType(nextScheduleType);
    setWorkDaysPerWeek(
      String(
        clampWorkDaysPerWeek(
          meta.work_days_per_week,
          Array.isArray(nextOffer.work_days) && nextOffer.work_days.length > 0
            ? nextOffer.work_days.length
            : 5
        )
      )
    );
    setRestDaysPolicy(normalizeRestDaysPolicy(meta.rest_days_policy, nextScheduleType));
    setShiftRotationPattern(
      normalizeShiftRotationPattern(meta.shift_rotation_pattern, nextScheduleType)
    );
    setCompensationPackage(
      parseCompensationPackage(pkg.compensation_package ?? meta.compensation_package, {
        ...meta,
        ...pkg,
      })
    );
  };

  const handleStartDraft = async () => {
    try {
      setStartingDraft(true);
      setActionError(null);
      setActionSuccess(null);

      const result = await createHydratedOfferDraft(applicationId);
      if (!result?.success || !result.offer) {
        const message = result?.error || "Failed to create offer draft";
        setActionError(message);
        toast.error(message);
        return;
      }

      syncFormFromOffer(result.offer as OfferDraftRecord);
      toast.success("Offer draft created");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create offer draft";
      setActionError(message);
      toast.error(message);
    } finally {
      setStartingDraft(false);
    }
  };

  const buildUpdatesPayload = () => {
    const existingMeta = (offer?.job_metadata ?? offer?.metadata ?? {}) as Record<string, unknown>;
    const existingPackage = (offer?.financial_package ?? {}) as Record<string, unknown>;
    const parsedMonthlyAllowance = Math.max(0, Number(monthlyAllowance) || 0);
    const parsedAttendanceIncentive = Math.max(0, Number(attendanceIncentive) || 0);
    const parsedBenefits = benefits
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const resolvedDaysPerWeek = clampWorkDaysPerWeek(
      workDaysPerWeek,
      workDays.length > 0 ? workDays.length : 5
    );
    const workScheduleSummary = buildWorkScheduleSummary({
      scheduleType,
      workDaysPerWeek: resolvedDaysPerWeek,
      restDaysPolicy,
      shiftRotationPattern,
      shiftStart: shiftStart || "08:00",
      shiftEnd: shiftEnd || "17:00",
      workDays,
    });

    return {
      salary: Number(salary) || 0,
      start_date: startDate || null,
      work_setup: workSetup || "onsite",
      work_mode: (workSetup || "onsite").toLowerCase(),
      work_location_id: workLocationId || null,
      department: department.trim() || null,
      probation_days: Number(probationDays) || 0,
      shift_start: shiftStart || null,
      shift_end: shiftEnd || null,
      work_days: workDays.length > 0 ? workDays : null,
      financial_package: {
        ...existingPackage,
        offered_salary: Number(salary) || 0,
        monthly_allowance: parsedMonthlyAllowance,
        attendance_incentive: parsedAttendanceIncentive,
        performance_bonus: compensationPackage.performance_bonus.enabled
          ? compensationPackage.performance_bonus.amount
          : 0,
        compensation_package: compensationPackage,
      },
      job_metadata: {
        ...existingMeta,
        start_date: startDate || null,
        target_job_level: targetJobLevel,
        reports_to_employee_id: reportsToEmployeeId || null,
        reports_to_label: resolvedReportsToLabel || null,
        reports_to: resolvedReportsToLabel || null,
        benefits: parsedBenefits,
        monthly_allowance: parsedMonthlyAllowance,
        attendance_incentive: parsedAttendanceIncentive,
        performance_bonus: compensationPackage.performance_bonus.enabled
          ? compensationPackage.performance_bonus.amount
          : 0,
        compensation_package: compensationPackage,
        schedule_type: scheduleType,
        work_days_per_week: resolvedDaysPerWeek,
        rest_days_policy: restDaysPolicy,
        shift_rotation_pattern: shiftRotationPattern,
        shift_start: shiftStart || "08:00",
        shift_end: shiftEnd || "17:00",
        work_days: workDays.length > 0 ? workDays : null,
        work_schedule_summary: workScheduleSummary,
      },
    };
  };

  const handleSaveDraft = async () => {
    if (!offer) return;
    try {
      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      const updates = buildUpdatesPayload();
      const result = await updateOfferDraft(offer.id, updates);
      if (!result?.success) {
        const message = result?.error || "Failed to save draft";
        setActionError(message);
        toast.error(message);
        return;
      }

      if (result.offer) {
        syncFormFromOffer(result.offer as OfferDraftRecord);
      }
      setActionSuccess("Draft saved.");
      toast.success("Draft saved");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save draft";
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendOffer = async () => {
    if (!offer) return;
    try {
      setSending(true);
      setActionError(null);
      setActionSuccess(null);

      if (canApproveAndSendOffers) {
        const updates = buildUpdatesPayload();
        const saveRes = await updateOfferDraft(offer.id, updates);
        if (!saveRes?.success) {
          const message = saveRes?.error || "Failed to save offer terms before sending";
          setActionError(message);
          toast.error(message);
          return;
        }
      }

      const resolvedJobId = String(offer.job_id || jobId).trim();
      const result = await sendDraftOffer(resolvedJobId, applicationId, offer.id);
      if (!result?.success) {
        const message = result?.error || "Failed to send offer";
        setActionError(message);
        toast.error(message);
        return;
      }

      setActionSuccess("Offer sent.");
      toast.success("Offer sent");
      onSent?.(offer.id);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send offer";
      setActionError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const toggleWorkDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]
    );
  };

  if (!offer) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Job Offer Preparation
          </p>
          <h1 className="mt-1 text-xl font-bold text-text-primary">{candidateName}</h1>
          <p className="text-sm text-text-secondary">{jobTitle}</p>
        </div>

        <p className="text-sm text-text-secondary">
          No offer draft exists for this application yet. Start a draft to review and customize the offer terms before sending.
        </p>

        {actionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
            {actionError}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleStartDraft}
            disabled={startingDraft}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {startingDraft ? "Starting draft..." : "Start offer draft"}
          </button>
        </div>
      </div>
    );
  }

  const currentMeta = (offer?.job_metadata ?? offer?.metadata ?? {}) as Record<string, unknown>;
  const recruiterRec = (currentMeta.recruiter_recommendation ?? null) as
    | RecruiterOfferRecommendation
    | null;
  const negotiationDecision = (currentMeta.negotiation_decision ?? null) as {
    status?: string;
    decision_note?: string | null;
    decided_by_name?: string | null;
    decided_at?: string | null;
  } | null;
  const normalizedOfferStatus = String(offer?.status ?? "").trim().toUpperCase();
  const hasActiveNegotiationOrPendingRec =
    normalizedOfferStatus === "NEGOTIATION_PENDING" ||
    normalizedOfferStatus === "NEGOTIATING" ||
    recruiterRec?.status === "pending";
  const isDeclinedDecision =
    recruiterRec?.status === "declined" || negotiationDecision?.status === "declined";
  const declinedNoteText =
    negotiationDecision?.decision_note ?? recruiterRec?.decision_note ?? null;
  const declinedByName =
    negotiationDecision?.decided_by_name ?? recruiterRec?.decided_by_name ?? null;

  const handleSubmitRecommendation = async () => {
    if (!offer) return;
    const parsed = Number(recSalaryInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a valid recommended basic salary.");
      return;
    }
    if (!recJustification.trim()) {
      toast.error("Enter a justification note for HR review.");
      return;
    }
    setSubmittingRec(true);
    try {
      const res = await submitRecruiterOfferRecommendationAction({
        offerId: offer.id,
        recommendedBaseSalary: parsed,
        justification: recJustification,
      });
      if (!res.success) {
        toast.error(res.error || "Failed to submit recommendation");
        return;
      }
      if (res.offer) {
        syncFormFromOffer(res.offer as unknown as OfferDraftRecord);
      }
      toast.success("Salary recommendation sent to HR Admin / Generalist");
      router.refresh();
    } finally {
      setSubmittingRec(false);
    }
  };

  const handleDeclineNegotiation = async () => {
    if (!offer) return;
    setDecliningNegotiation(true);
    try {
      const res = await declineOfferNegotiationAction({
        offerId: offer.id,
        decisionNote: declineNote,
      });
      if (!res.success) {
        toast.error(res.error || "Failed to decline negotiation");
        return;
      }
      if (res.offer) {
        syncFormFromOffer(res.offer as unknown as OfferDraftRecord);
      }
      setShowDeclineBox(false);
      toast.success("Negotiation declined — standing offer maintained");
      router.refresh();
    } finally {
      setDecliningNegotiation(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-5">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{candidateName}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-text-secondary">{jobTitle}</p>
            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#1E1B4B]">
              Role Tier: {JOB_LEVEL_LABELS[targetJobLevel]}
            </span>
          </div>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          {offer.status || "Draft"}
        </span>
      </div>

      {isDeclinedDecision && (
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs space-y-1">
          <p className="font-bold text-slate-900">Declined — Standing Offer Maintained</p>
          {declinedNoteText && <p className="text-slate-700">{declinedNoteText}</p>}
          {declinedByName && (
            <p className="text-[11px] text-text-secondary">Decision by {declinedByName}</p>
          )}
        </div>
      )}

      {canApproveAndSendOffers && hasActiveNegotiationOrPendingRec && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Maker-Checker Offer Review Required
            </p>
            {recruiterRec?.status === "pending" ? (
              <div className="text-xs text-amber-900 space-y-0.5">
                <p>
                  <span className="font-semibold">{recruiterRec.recommended_by_name}</span>{" "}
                  recommended basic salary{" "}
                  <span className="font-bold">
                    ₱{Number(recruiterRec.recommended_base_salary).toLocaleString("en-PH")}
                  </span>
                </p>
                <p className="text-amber-800">Justification: {recruiterRec.justification}</p>
              </div>
            ) : (
              <p className="text-xs text-amber-900">
                Candidate requested offer negotiation. Revise terms below or maintain the standing offer.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {recruiterRec?.status === "pending" && (
              <button
                type="button"
                onClick={() => {
                  setSalary(String(recruiterRec.recommended_base_salary));
                  toast.info("Applied recommended salary to form — review and save/send when ready.");
                }}
                className="rounded-lg bg-indigo-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800"
              >
                Accept &amp; Apply Recommended Salary
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowDeclineBox((prev) => !prev)}
              className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Decline Negotiation / Maintain Standing Offer
            </button>
          </div>

          {showDeclineBox && (
            <div className="space-y-2 border-t border-amber-200 pt-3">
              <textarea
                rows={2}
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                placeholder="Optional decision note (e.g., Exceeds approved budget cap for this tier; original offer stands)"
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeclineBox(false)}
                  disabled={decliningNegotiation}
                  className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeclineNegotiation()}
                  disabled={decliningNegotiation}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
                >
                  {decliningNegotiation ? "Declining..." : "Confirm Decline & Maintain Offer"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!canApproveAndSendOffers && canSubmitRecommendation && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#1E1B4B]">
              Recruiter Salary &amp; Compensation Recommendation
            </p>
            <p className="text-xs text-slate-600">
              Standard offer terms from the job posting are pre-approved and ready to send. To request custom compensation overrides, submit a recommendation for HR Admin / Generalist approval.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Recommended Basic Salary (₱)</span>
              <input
                type="number"
                min="1"
                value={recSalaryInput}
                onChange={(e) => setRecSalaryInput(e.target.value)}
                placeholder="e.g. 42000"
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-900"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">Justification Note</span>
              <textarea
                rows={2}
                value={recJustification}
                onChange={(e) => setRecJustification(e.target.value)}
                placeholder="Explain candidate experience, market benchmark, or negotiation context..."
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-900"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSubmitRecommendation()}
              disabled={submittingRec}
              className="rounded-lg bg-[#1E1B4B] px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-900 disabled:opacity-60"
            >
              {submittingRec ? "Submitting..." : "Submit Recommendation to HR"}
            </button>
          </div>
        </div>
      )}

      <fieldset disabled={!canApproveAndSendOffers} className="space-y-5">
      <div className="rounded-xl border border-border bg-white/60 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Philippine Allowances &amp; Incentives
        </p>
        <PhilippineCompensationChecklist
          value={compensationPackage}
          onChange={handleCompensationPackageChange}
          allowCustomItems
          baseSalary={Number(salary) || 0}
        />
      </div>

      <div className="rounded-xl border border-border bg-white/60 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Compensation &amp; Incentives
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-text-secondary">Salary</span>
            <input
              type="number"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-text-secondary">
              Monthly Allowance (₱)
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
              value={monthlyAllowance}
              onChange={(e) => setMonthlyAllowance(e.target.value)}
            />
            <span className="block text-[11px] text-text-secondary">
              Internet / Rice / Transport allowance
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-text-secondary">
              Perfect Attendance Incentive (₱)
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
              value={attendanceIncentive}
              onChange={(e) => setAttendanceIncentive(e.target.value)}
            />
            <span className="block text-[11px] text-text-secondary">
              Awarded when 0 lates &amp; 0 absences
            </span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Start date</span>
          <input
            type="date"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Work setup</span>
          <select
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={workSetup}
            onChange={(e) => setWorkSetup(e.target.value)}
          >
            <option value="Remote">Remote</option>
            <option value="Hybrid">Hybrid</option>
            <option value="On-site">On-site</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Branch</span>
          <select
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={workLocationId}
            onChange={(e) => setWorkLocationId(e.target.value)}
          >
            <option value="">None / Default location</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.address ? ` — ${b.address}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Department</span>
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">
            Reports To / Direct Supervisor
          </span>
          <select
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={reportsToEmployeeId}
            onChange={(e) => setReportsToEmployeeId(e.target.value)}
          >
            <option value="">
              {reportsToFallbackLabel && !reportsToEmployeeId
                ? reportsToFallbackLabel
                : "None / Assign during hire"}
            </option>
            {sortedSupervisorOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {formatSupervisorDisplayLabel(candidate)}
                {candidate.department_name ? ` · ${candidate.department_name}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Probation days</span>
          <input
            type="number"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={probationDays}
            onChange={(e) => setProbationDays(e.target.value)}
          />
        </label>

        <div className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#1E1B4B]">
                Work Schedule &amp; Shift Rotation
              </p>
              <p className="text-[11px] text-slate-600">
                {buildWorkScheduleSummary({
                  scheduleType,
                  workDaysPerWeek: clampWorkDaysPerWeek(
                    workDaysPerWeek,
                    workDays.length > 0 ? workDays.length : 5
                  ),
                  restDaysPolicy,
                  shiftRotationPattern,
                  shiftStart: shiftStart || "08:00",
                  shiftEnd: shiftEnd || "17:00",
                  workDays,
                })}
              </p>
            </div>
            <span className="rounded-full border border-indigo-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#1E1B4B]">
              {formatScheduleTypeLabel(scheduleType)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-secondary">Schedule Type</span>
              <select
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
                value={scheduleType}
                onChange={(e) => {
                  const nextType = normalizeScheduleType(e.target.value);
                  setScheduleType(nextType);
                  if (nextType === "fixed") {
                    setRestDaysPolicy("fixed_weekends");
                    setShiftRotationPattern("fixed_shift_hours");
                  } else {
                    if (restDaysPolicy === "fixed_weekends") {
                      setRestDaysPolicy("rotating_rest_days");
                    }
                    if (shiftRotationPattern === "fixed_shift_hours") {
                      setShiftRotationPattern("weekly_rotation");
                    }
                  }
                }}
              >
                <option value="fixed">Fixed Schedule</option>
                <option value="rotating">Rotating / Shifting Schedule</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-secondary">Work Days / Week</span>
              <input
                type="number"
                min={1}
                max={7}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
                value={workDaysPerWeek}
                onChange={(e) => setWorkDaysPerWeek(e.target.value)}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-secondary">Rest Days Policy</span>
              <select
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
                value={restDaysPolicy}
                onChange={(e) =>
                  setRestDaysPolicy(normalizeRestDaysPolicy(e.target.value, scheduleType))
                }
              >
                {REST_DAYS_POLICY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-secondary">Shift Rotation Pattern</span>
              <select
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
                value={shiftRotationPattern}
                onChange={(e) =>
                  setShiftRotationPattern(
                    normalizeShiftRotationPattern(e.target.value, scheduleType)
                  )
                }
              >
                {SHIFT_ROTATION_PATTERN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-secondary">
                {scheduleType === "rotating" ? "Initial Shift Start" : "Shift Start"}
              </span>
              <input
                type="time"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-secondary">
                {scheduleType === "rotating" ? "Initial Shift End" : "Shift End"}
              </span>
              <input
                type="time"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2.5 text-xs sm:grid-cols-3">
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-400">Shift Hours</span>
              <p className="font-semibold text-slate-800">
                {formatScheduleTime12h(shiftStart || "08:00")} – {formatScheduleTime12h(shiftEnd || "17:00")}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-400">Rest Policy</span>
              <p className="font-semibold text-slate-800">{formatRestDaysPolicyLabel(restDaysPolicy)}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-[10px] font-semibold uppercase text-slate-400">Rotation</span>
              <p className="font-semibold text-slate-800">
                {formatShiftRotationPatternLabel(shiftRotationPattern)}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-text-secondary">
              {scheduleType === "rotating" ? "Default / Initial Work Days" : "Work Days"}
            </span>
            <div className="flex flex-wrap gap-2">
              {STANDARD_WORK_DAYS.map((day) => {
                const selected = workDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWorkDay(day)}
                    className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-white text-text-secondary hover:bg-surface"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-text-secondary">
            Benefits (comma separated)
          </span>
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={benefits}
            onChange={(e) => setBenefits(e.target.value)}
          />
        </label>
      </div>
      </fieldset>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-700">
          {actionSuccess}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface"
          >
            {canApproveAndSendOffers ? "Cancel" : "Close"}
          </button>
        )}
        {canApproveAndSendOffers ? (
          <>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || sending}
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save draft"}
            </button>
            <button
              type="button"
              onClick={handleSendOffer}
              disabled={saving || sending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send offer"}
            </button>
          </>
        ) : (
          canSendStandardOffer &&
          !hasActiveNegotiationOrPendingRec &&
          !["SENT", "SIGNED", "HIRED", "HIRE_CONFIRMED"].includes(normalizedOfferStatus) && (
            <button
              type="button"
              onClick={handleSendOffer}
              disabled={sending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {sending ? "Sending Standard Offer..." : "Send Standard Offer"}
            </button>
          )
        )}
      </div>
    </div>
  );
}
