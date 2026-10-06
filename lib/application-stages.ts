/**
 * lib/application-stages.ts
 * Single source of truth for application status → UI stage mapping.
 * Used by the HR Kanban board, stage badges, and the applicant pipeline page.
 */

// ─── UI Stage Keys ─────────────────────────────────────────────────────────────

export type UiStageKey =
  | "new"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "closed"   // wraps rejected + withdrawn
  | "other";   // catch-all: never silently drop a card

// ─── Ordered stage list (Active pipeline first, then terminal) ─────────────────

export interface UiStage {
  key: UiStageKey;
  label: string;
  description: string;
  /** Token-based badge class – uses design-system tokens only */
  badgeClassName: string;
  /** Whether this stage is shown in the main board columns */
  isActive: boolean;
}

export const UI_STAGES: UiStage[] = [
  {
    key: "new",
    label: "New",
    description: "Fresh applications awaiting review",
    badgeClassName: "bg-primary-light text-primary-dark border border-primary/20",
    isActive: true,
  },
  {
    key: "screening",
    label: "Screening",
    description: "Assessment in progress",
    badgeClassName: "bg-warning-bg text-warning border border-warning/20",
    isActive: true,
  },
  {
    key: "interview",
    label: "Interview",
    description: "Interview coordination",
    badgeClassName: "bg-primary-light text-primary-dark border border-primary/20",
    isActive: true,
  },
  {
    key: "offer",
    label: "Offer & Contract",
    description: "Offer and negotiation",
    badgeClassName: "bg-success-bg text-success border border-success/20",
    isActive: true,
  },
  {
    key: "hired",
    label: "Hired",
    description: "Hire confirmed",
    badgeClassName: "bg-success-bg text-success border border-success/20",
    isActive: true,
  },
  {
    key: "closed",
    label: "Closed",
    description: "Rejected or withdrawn",
    badgeClassName: "bg-error-bg text-error border border-error/20",
    isActive: false, // rendered as a collapsed section
  },
  {
    key: "other",
    label: "Other",
    description: "Unknown status – requires attention",
    badgeClassName: "bg-surface-bg text-text-muted border border-border",
    isActive: false,
  },
];

// ─── Status → Stage mapping ────────────────────────────────────────────────────
// Every value the DB can write for job_applications.status must appear here.

const STATUS_TO_STAGE: Record<string, UiStageKey> = {
  // ── New / Applied ────────────────────────────────────────────────
  applied:              "new",
  draft:                "new",
  submitted:            "new",

  // ── Screening ────────────────────────────────────────────────────
  screening:            "screening",
  under_review:         "screening",
  shortlisted:          "screening",

  // ── Interview ────────────────────────────────────────────────────
  interview:            "interview",
  interviewing:         "interview",
  interview_scheduled:  "interview",
  interviewed:          "interview",

  // ── Offer & Contract ─────────────────────────────────────────────
  offer:                "offer",
  offer_sent:           "offer",
  negotiating:          "offer",
  offer_accepted:       "offer",
  offer_declined:       "offer",
  offer_expired:        "offer",
  pre_employment:       "offer",

  // ── Hired ────────────────────────────────────────────────────────
  hired:                "hired",
  hire_confirmed:       "hired",

  // ── Closed (rejected + withdrawn) ────────────────────────────────
  rejected:             "closed",
  withdrawn:            "closed",
};

/**
 * Map a raw DB status value to a UI stage key.
 * Unknown values fall into "other" so cards are never silently dropped.
 */
export function getStageForStatus(status: string | null | undefined): UiStageKey {
  if (!status) return "other";
  return STATUS_TO_STAGE[status.toLowerCase()] ?? "other";
}

/**
 * Returns all DB status values that map to the given UI stage.
 */
export function getStatusesForStage(stage: UiStageKey): string[] {
  return Object.entries(STATUS_TO_STAGE)
    .filter(([, s]) => s === stage)
    .map(([k]) => k);
}

/** Active stages shown as Kanban columns (in order) */
export const ACTIVE_STAGES = UI_STAGES.filter((s) => s.isActive);

/** Terminal stages (closed + other) shown as collapsed sections */
export const TERMINAL_STAGES = UI_STAGES.filter((s) => !s.isActive);

/** Next active stage key for the "advance" action */
const NEXT_STAGE: Partial<Record<UiStageKey, UiStageKey>> = {
  new:        "screening",
  screening:  "interview",
  interview:  "offer",
  offer:      "hired",
};

/** Returns the DB status string for the next stage, or null when at end of pipe */
export function getNextDbStatus(currentStage: UiStageKey): string | null {
  const nextStage = NEXT_STAGE[currentStage];
  if (!nextStage) return null;
  // Use the canonical first status for each stage
  const STAGE_CANONICAL_STATUS: Record<UiStageKey, string | null> = {
    new:        "applied",
    screening:  "screening",
    interview:  "interview",
    offer:      "offer",
    hired:      "hired",
    closed:     "rejected",
    other:      null,
  };
  return STAGE_CANONICAL_STATUS[nextStage] ?? null;
}
