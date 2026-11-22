import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotification } from "@/lib/notifications";

export interface CascadeCloseResult {
  closedApplicationIds: string[];
  cancelledInterviewCount: number;
  withdrawnOfferCount: number;
}

const TERMINAL_APPLICATION_STATUSES = ["hired", "hire_confirmed", "rejected", "withdrawn"];

/**
 * Cascade-closes all secondary open applications, pending/scheduled interviews,
 * and open job offers when an applicant transitions to Employee.
 */
export async function cascadeCloseSecondaryApplicationsOnHire(params: {
  admin: SupabaseClient;
  applicantId: string;
  winningApplicationId: string;
  jobTitle: string;
}): Promise<CascadeCloseResult> {
  const { admin, applicantId, winningApplicationId, jobTitle } = params;
  const now = new Date().toISOString();
  const autoCloseReason = `Automatically closed — candidate hired for ${jobTitle}`;

  const closedIds = new Set<string>();

  // 1. Query and close secondary open rows in canonical `job_applications`
  const { data: openJobApps } = await admin
    .from("job_applications")
    .select("id, status")
    .eq("applicant_id", applicantId)
    .neq("id", winningApplicationId)
    .not("status", "in", `(${TERMINAL_APPLICATION_STATUSES.map((s) => `"${s}"`).join(",")})`);

  const secondaryJobAppIds = (openJobApps ?? [])
    .map((row) => row.id as string)
    .filter(Boolean);

  if (secondaryJobAppIds.length > 0) {
    const { error: updateErr } = await admin
      .from("job_applications")
      .update({
        status: "withdrawn",
        rejection_reason: autoCloseReason,
        hr_notes: autoCloseReason,
        updated_at: now,
      })
      .in("id", secondaryJobAppIds);

    if (updateErr) {
      // Fallback in case rejection_reason or hr_notes column differs in schema
      await admin
        .from("job_applications")
        .update({
          status: "withdrawn",
          updated_at: now,
        })
        .in("id", secondaryJobAppIds);
    }

    for (const id of secondaryJobAppIds) {
      closedIds.add(id);
    }
  }

  // 2. Best-effort sync on mirrored `applications` table if present
  try {
    const { data: openLegacyApps } = await admin
      .from("applications")
      .select("id, status")
      .eq("candidate_id", applicantId)
      .neq("id", winningApplicationId)
      .not("status", "in", `(${TERMINAL_APPLICATION_STATUSES.map((s) => `"${s}"`).join(",")})`);

    const legacyIds = (openLegacyApps ?? [])
      .map((row) => row.id as string)
      .filter(Boolean);

    if (legacyIds.length > 0) {
      await admin
        .from("applications")
        .update({
          status: "withdrawn",
          hr_notes: autoCloseReason,
          updated_at: now,
        })
        .in("id", legacyIds);

      for (const id of legacyIds) {
        closedIds.add(id);
      }
    }
  } catch {
    // Non-blocking if legacy `applications` table is absent or unused
  }

  const allSecondaryIds = Array.from(closedIds);
  let cancelledInterviewCount = 0;
  let withdrawnOfferCount = 0;

  if (allSecondaryIds.length > 0) {
    // 3. Cancel pending/scheduled `interview_schedules` linked to secondary applications
    try {
      const { data: cancelledInterviews } = await admin
        .from("interview_schedules")
        .update({
          status: "cancelled",
          updated_at: now,
        })
        .in("application_id", allSecondaryIds)
        .not("status", "in", '("cancelled","completed")')
        .select("id");

      cancelledInterviewCount = cancelledInterviews?.length ?? 0;
    } catch {
      // Non-blocking
    }

    // 4. Withdraw/expire any open `job_offers` linked to secondary applications
    try {
      const { data: withdrawnOffers, error: withdrawOfferErr } = await admin
        .from("job_offers")
        .update({
          status: "withdrawn",
          updated_at: now,
        })
        .in("application_id", allSecondaryIds)
        .not("status", "in", '("HIRED","HIRE_CONFIRMED","DECLINED","EXPIRED","withdrawn","WITHDRAWN")')
        .select("id");

      if (withdrawOfferErr) {
        const { data: expiredOffers } = await admin
          .from("job_offers")
          .update({
            status: "EXPIRED",
            updated_at: now,
          })
          .in("application_id", allSecondaryIds)
          .not("status", "in", '("HIRED","HIRE_CONFIRMED","DECLINED","EXPIRED","withdrawn","WITHDRAWN")')
          .select("id");
        withdrawnOfferCount = expiredOffers?.length ?? 0;
      } else {
        withdrawnOfferCount = withdrawnOffers?.length ?? 0;
      }
    } catch {
      // Non-blocking
    }

    // 5. Insert a single informational notification for the hired employee
    await sendNotification({
      recipientId: applicantId,
      type: "general",
      title: "Other Applications Automatically Closed",
      body: `Congratulations on your onboarding for ${jobTitle}! Your ${allSecondaryIds.length} other open application${allSecondaryIds.length === 1 ? " was" : "s were"} automatically withdrawn.`,
      actionUrl: "/applicant/applications",
      actionName: "cascadeCloseOnHire",
    });
  }

  return {
    closedApplicationIds: allSecondaryIds,
    cancelledInterviewCount,
    withdrawnOfferCount,
  };
}
