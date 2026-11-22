/**
 * Re-exports canonical application match persistence from `lib/match-scoring.ts`.
 */
import { computeAndStoreApplicationMatch } from "@/lib/match-scoring";

export async function computeAndStoreMatchScore(
  applicationId: string,
  forceRecompute = false
) {
  return computeAndStoreApplicationMatch(applicationId, forceRecompute);
}
