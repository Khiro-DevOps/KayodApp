import type { ApplicationStatus } from "@/lib/types";

/**
 * Pipeline Stage Definition
 */
export interface PipelineStage {
  key: string;
  label: string;
  statuses: ApplicationStatus[];
  position: number;
}

/**
 * Strict linear pipeline: New → Screening → Interview → Offer → Pre-employment → Hired
 */
export const PIPELINE_STAGES: PipelineStage[] = [
  { key: "new", label: "New", statuses: ["submitted", "draft"], position: 0 },
  { key: "screening", label: "Screening", statuses: ["under_review", "shortlisted"], position: 1 },
  { key: "interview", label: "Interview", statuses: ["interview_scheduled", "interviewed"], position: 2 },
  { key: "offer", label: "Offer", statuses: ["negotiating", "offer_sent", "offer_accepted"], position: 3 },
  { key: "pre_employment", label: "Pre-employment", statuses: ["pre_employment"], position: 4 },
  { key: "hired", label: "Hired", statuses: ["hired", "hire_confirmed"], position: 5 },
];

/**
 * Get the current stage of an applicant
 */
export function getCurrentStage(status: ApplicationStatus): PipelineStage | null {
  // Normalize status to a trimmed string to avoid mismatches from unexpected casing/whitespace
  const normalized = String(status ?? "").trim();
  return PIPELINE_STAGES.find((stage) => stage.statuses.includes(normalized as ApplicationStatus)) || null;
}

/**
 * Get the next stage in the pipeline
 */
export function getNextStage(currentStatus: ApplicationStatus): PipelineStage | null {
  const currentStage = getCurrentStage(currentStatus);
  if (!currentStage) return null;

  const nextPosition = currentStage.position + 1;
  return PIPELINE_STAGES.find((stage) => stage.position === nextPosition) || null;
}

/**
 * Determine the default status for moving to a given stage
 */
export function getDefaultStatusForStage(stageKey: string): ApplicationStatus | null {
  const stage = PIPELINE_STAGES.find((s) => s.key === stageKey);
  if (!stage) return null;
  // Return the first status in the stage
  return stage.statuses[0] || null;
}

/**
 * Validate if an applicant can move to a specific stage
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateStageProgression(
  currentStatus: ApplicationStatus,
  targetStageKey: string
): ValidationResult {
  const currentStage = getCurrentStage(currentStatus);
  if (!currentStage) {
    return { valid: false, reason: `Invalid current status: ${currentStatus}` };
  }

  const targetStage = PIPELINE_STAGES.find((s) => s.key === targetStageKey);
  if (!targetStage) {
    return { valid: false, reason: `Invalid target stage: ${targetStageKey}` };
  }

  // Enforce monotonic forward progression: target must be strictly later than current.
  // This prevents accidental fallbacks to earlier stages when an application is already advanced.
  if (targetStage.position <= currentStage.position) {
    return {
      valid: false,
      reason: `Invalid transition: cannot move from ${currentStage.label} (pos ${currentStage.position}) to ${targetStage.label} (pos ${targetStage.position}). Backward or same-stage moves are not allowed.`,
    };
  }

  return { valid: true };
}

/**
 * Pipeline transition result
 */
export interface TransitionResult {
  success: boolean;
  error?: string;
  newStatus?: ApplicationStatus;
}

/**
 * Define what happens when moving to each stage
 * Returns the new status and any side effects (like creating an offer)
 */
export type StageTransitionHandler = (applicationId: string) => Promise<TransitionResult>;

/**
 * Action types for different stage transitions
 */
export enum PipelineAction {
  MOVE_TO_SCREENING = "move_to_screening",
  MOVE_TO_INTERVIEW = "move_to_interview", // Requires interview scheduling
  MOVE_TO_OFFER = "move_to_offer", // Requires sending offer
  MOVE_TO_PRE_EMPLOYMENT = "move_to_pre_employment", // Requires signed offer
  MOVE_TO_HIRED = "move_to_hired", // Requires confirming hire
}

/**
 * Get the action name for moving from current status to next stage
 */
export function getNextAction(currentStatus: ApplicationStatus): PipelineAction | null {
  const nextStage = getNextStage(currentStatus);
  if (!nextStage) return null;

  switch (nextStage.key) {
    case "screening":
      return PipelineAction.MOVE_TO_SCREENING;
    case "interview":
      return PipelineAction.MOVE_TO_INTERVIEW;
    case "offer":
      return PipelineAction.MOVE_TO_OFFER;
    case "pre_employment":
      return PipelineAction.MOVE_TO_PRE_EMPLOYMENT;
    case "hired":
      return PipelineAction.MOVE_TO_HIRED;
    default:
      return null;
  }
}

/**
 * Get the required fields/setup before allowing transition to a stage
 */
export interface TransitionRequirements {
  requiresInterviewScheduling?: boolean;
  requiresOfferCreation?: boolean;
  requiresOfferSending?: boolean;
  requiresSignedOffer?: boolean;
  requiresHireConfirmation?: boolean;
}

export function getTransitionRequirements(targetStageKey: string): TransitionRequirements {
  switch (targetStageKey) {
    case "interview":
      return { requiresInterviewScheduling: true };
    case "offer":
      return { requiresOfferCreation: true, requiresOfferSending: true };
    case "pre_employment":
      return { requiresSignedOffer: true };
    case "hired":
      return { requiresSignedOffer: true, requiresHireConfirmation: true };
    default:
      return {};
  }
}
