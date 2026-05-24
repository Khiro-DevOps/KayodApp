import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { getAdminClient } from "../lib/supabase/admin";
import { POST as computeMatchScore } from "../app/api/compute-match-score/route";

type ApplicationRow = {
  id: string;
  candidate_id: string;
  job_posting_id: string;
};

async function main() {
  const force = process.argv.includes("--force");
  const admin = getAdminClient();

  const { data: applications, error: applicationsError } = await admin
    .from("applications")
    .select("id, candidate_id, job_posting_id")
    .order("id", { ascending: true });

  if (applicationsError) {
    throw applicationsError;
  }

  if (!applications?.length) {
    console.log("No applications found.");
    return;
  }

  const { data: scoreRows, error: scoreRowsError } = await admin
    .from("match_scores")
    .select("applicant_id, job_id");

  if (scoreRowsError) {
    throw scoreRowsError;
  }

  const existingKeys = new Set((scoreRows ?? []).map((row) => `${row.applicant_id}:${row.job_id}`));

  const applicationRows = (applications ?? []) as ApplicationRow[];

  const appIdsToProcess = force
    ? applicationRows.map((application) => application.id)
    : applicationRows
        .filter((application) => !existingKeys.has(`${application.candidate_id}:${application.job_posting_id}`))
        .map((application) => application.id);

  if (!appIdsToProcess.length) {
    console.log(force ? "No applications to recompute." : "All applications already have match_scores rows.");
    return;
  }

  console.log(`Processing ${appIdsToProcess.length} application(s)${force ? " with force" : ""}...`);

  let successCount = 0;
  let failureCount = 0;

  for (const applicationId of appIdsToProcess) {
    const response = await computeMatchScore(
      new Request("http://localhost/api/compute-match-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ application_id: applicationId, force }),
      })
    );

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; score?: number; error?: string }
      | null;

    if (response.ok && payload?.success) {
      successCount++;
      console.log(`✓ ${applicationId} -> ${payload.score ?? "ok"}`);
    } else {
      failureCount++;
      console.error(`✗ ${applicationId} -> ${payload?.error ?? response.statusText}`);
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