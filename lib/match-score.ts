/**
 * Re-exports from the unified canonical scoring engine (`lib/match-scoring.ts`)
 * for backwards compatibility across all existing imports.
 */
import {
  computeCanonicalJobMatch,
  computeSetupAndLocationSubScore,
  getDisplayMatchScore,
  type CanonicalJobInput,
  type DisplayMatchScoreInput,
  type DisplayMatchScoreResult,
} from "@/lib/match-scoring";

export {
  computeCanonicalJobMatch,
  getDisplayMatchScore,
  type DisplayMatchScoreInput,
  type DisplayMatchScoreResult,
};

export function computeMatchScore(
  resumeText: string,
  job: CanonicalJobInput
): number {
  return computeCanonicalJobMatch({
    resume: resumeText,
    job,
  }).score;
}

export function calculateCompatibilityScore(
  workSetup: string | null | undefined,
  jobCityId?: number | string | null,
  jobProvinceId?: number | string | null,
  candidateCityId?: number | string | null,
  candidateProvinceId?: number | string | null,
  candidatePrefWorkSetup?: string | null | undefined
): number {
  const sub = computeSetupAndLocationSubScore(
    {
      title: "",
      work_setup: workSetup ?? null,
      city_id: jobCityId ?? null,
      province_id: jobProvinceId ?? null,
    },
    "",
    {
      city_id: candidateCityId ?? null,
      province_id: candidateProvinceId ?? null,
      preferred_work_setup: candidatePrefWorkSetup ?? null,
    }
  );
  return sub / 100;
}

export function calculateWeightedMatchScore(
  semantic_score: number,
  compatibility_score: number
): number {
  const clampedSemantic = Math.max(0, Math.min(100, semantic_score));
  const clampedCompatibility = Math.max(0, Math.min(1.0, compatibility_score));
  return Math.round(clampedSemantic * 0.75 + clampedCompatibility * 25);
}
