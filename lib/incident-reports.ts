export const INCIDENT_STATUSES = [
  "draft",
  "nte_issued",
  "explanation_submitted",
  "under_review",
  "resolved",
  "dismissed",
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const OFFENSE_CATEGORIES = [
  "Attendance / Tardiness",
  "Policy Violation",
  "Insubordination",
  "Negligence / Quality",
  "Code of Conduct",
  "Other",
] as const;

export type OffenseCategory = (typeof OFFENSE_CATEGORIES)[number];

export const DISCIPLINARY_SANCTIONS = [
  "none",
  "verbal_warning",
  "written_warning",
  "final_written_warning",
  "suspension",
  "termination",
] as const;

export type DisciplinarySanction = (typeof DISCIPLINARY_SANCTIONS)[number];

export const STATUTORY_NTE_DAYS = 5;

export const INCIDENT_STATUS_META: Record<
  IncidentStatus,
  { label: string; badgeClass: string }
> = {
  draft: {
    label: "Draft (HR Review)",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  nte_issued: {
    label: "NTE Issued",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
  },
  explanation_submitted: {
    label: "Explanation Submitted",
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
  under_review: {
    label: "Under Review",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
  },
  resolved: {
    label: "Resolved",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  dismissed: {
    label: "Dismissed",
    badgeClass: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
};

export const SANCTION_META: Record<
  DisciplinarySanction,
  { label: string; badgeClass: string }
> = {
  none: {
    label: "No Sanction / Exonerated",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  verbal_warning: {
    label: "Verbal Warning",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
  },
  written_warning: {
    label: "Written Warning",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
  },
  final_written_warning: {
    label: "Final Written Warning",
    badgeClass: "bg-orange-50 text-orange-800 border-orange-200",
  },
  suspension: {
    label: "Suspension",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
  },
  termination: {
    label: "Termination",
    badgeClass: "bg-red-100 text-red-800 border-red-300",
  },
};

/**
 * Computes the statutory 5-calendar-day NTE deadline from `issuedAt`.
 * Matches PostgreSQL `nte_issued_at + interval '5 days'`.
 */
export function computeNteDeadline(issuedAt: Date | string): Date {
  const start = issuedAt instanceof Date ? new Date(issuedAt.getTime()) : new Date(issuedAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Invalid NTE issued date");
  }
  return new Date(start.getTime() + STATUTORY_NTE_DAYS * 24 * 60 * 60 * 1000);
}

export interface NteCountdown {
  isOverdue: boolean;
  remainingMs: number;
  remainingDays: number;
  remainingHours: number;
  label: string;
}

export function getNteCountdown(
  deadlineAt: Date | string | null | undefined,
  now: Date = new Date()
): NteCountdown {
  if (!deadlineAt) {
    return {
      isOverdue: false,
      remainingMs: 0,
      remainingDays: 0,
      remainingHours: 0,
      label: "No deadline set",
    };
  }

  const deadline = deadlineAt instanceof Date ? deadlineAt : new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    return {
      isOverdue: false,
      remainingMs: 0,
      remainingDays: 0,
      remainingHours: 0,
      label: "Invalid deadline",
    };
  }

  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) {
    const overdueDays = Math.floor(Math.abs(diffMs) / (24 * 60 * 60 * 1000));
    const overdueHours = Math.floor(
      (Math.abs(diffMs) % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
    );
    const label =
      overdueDays > 0
        ? `Overdue by ${overdueDays}d ${overdueHours}h (5-day window lapsed)`
        : `Overdue by ${Math.max(1, overdueHours)}h (5-day window lapsed)`;
    return {
      isOverdue: true,
      remainingMs: diffMs,
      remainingDays: 0,
      remainingHours: 0,
      label,
    };
  }

  const remainingDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const remainingHours = Math.floor(
    (diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
  );
  const label =
    remainingDays > 0
      ? `${remainingDays}d ${remainingHours}h remaining`
      : `${Math.max(1, remainingHours)}h remaining`;

  return {
    isOverdue: false,
    remainingMs: diffMs,
    remainingDays,
    remainingHours,
    label,
  };
}

export function canIssueNte(status: IncidentStatus): boolean {
  return status === "draft";
}

export function canSubmitExplanation(status: IncidentStatus): boolean {
  return status === "nte_issued";
}

export function canResolveCase(
  status: IncidentStatus,
  nteDeadlineAt?: Date | string | null,
  now: Date = new Date()
): {
  allowed: boolean;
  reason?: string;
  isLapsedWithoutResponse?: boolean;
} {
  if (status === "explanation_submitted" || status === "under_review") {
    return { allowed: true, isLapsedWithoutResponse: false };
  }

  if (status === "nte_issued") {
    if (!nteDeadlineAt) {
      return {
        allowed: false,
        reason: "NTE deadline is missing; cannot resolve before the 5-day window.",
      };
    }
    const deadline = nteDeadlineAt instanceof Date ? nteDeadlineAt : new Date(nteDeadlineAt);
    if (Number.isNaN(deadline.getTime())) {
      return {
        allowed: false,
        reason: "Invalid NTE deadline.",
      };
    }
    if (now.getTime() >= deadline.getTime()) {
      return { allowed: true, isLapsedWithoutResponse: true };
    }
    return {
      allowed: false,
      reason:
        "Employee still has time within the 5-calendar-day NTE response window.",
    };
  }

  if (status === "draft") {
    return {
      allowed: false,
      reason:
        "A Notice to Explain (NTE) must be issued before a final decision can be rendered.",
    };
  }

  return {
    allowed: false,
    reason: "This case is already closed.",
  };
}

export function formatManilaDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatManilaDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
