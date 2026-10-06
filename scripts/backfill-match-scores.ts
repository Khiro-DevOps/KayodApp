import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { getAdminClient } from "../lib/supabase/admin";
import { computeAndStoreMatchScore } from "../lib/compute-match-score";

type ApplicationRow = {
  id: string;
  applicant_id: string;
  job_id: string;
  match_score: number | null;
};

async function main() {
  const force = process.argv.includes("--force");
  const admin = getAdminClient();

  const { data: applications, error: applicationsError } = await admin
    .from("job_applications")
    .select("id, applicant_id, job_id, match_score")
    .order("id", { ascending: true });

  if (applicationsError) {
    throw applicationsError;
  }

  if (!applications?.length) {
    console.log("No applications found.");
    return;
  }

  const applicationRows = (applications ?? []) as ApplicationRow[];

  const appIdsToProcess = force
    ? applicationRows.map((application) => application.id)
    : applicationRows
        .filter((application) => !application.match_score || application.match_score === 0)
        .map((application) => application.id);

  if (!appIdsToProcess.length) {
    console.log(force ? "No applications to recompute." : "All applications already have match_scores rows.");
    return;
  }

  console.log(`Processing ${appIdsToProcess.length} application(s)${force ? " with force" : ""}...`);

  let successCount = 0;
  let failureCount = 0;

  for (const applicationId of appIdsToProcess) {
    const result = await computeAndStoreMatchScore(applicationId, force);

    if (result.success) {
      successCount++;
      console.log(`✓ ${applicationId} -> ${result.score ?? "ok"}`);
    } else {
      failureCount++;
      console.error(`✗ ${applicationId} -> ${result.error ?? "failed"}`);
    }
  }

  console.log(`Done. Success: ${successCount}, Failed: ${failureCount}`);

  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});