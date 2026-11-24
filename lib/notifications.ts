import "server-only";
import { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

export const NOTIFICATION_TYPES = [
  "application_submitted",
  "application_status_changed",
  "interview_scheduled",
  "interview_reminder",
  "interview_cancelled",
  "offer_letter",
  "leave_status_changed",
  "payroll_processed",
  "schedule_published",
  "general",
  "interview_rescheduled",
  "hire_confirmed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Returns the type if it is a valid notification_type enum value, else "general". */
export function toNotificationType(type: string): NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type)
    ? (type as NotificationType)
    : "general";
}

interface SendNotificationParams {
  /** Kept for signature compatibility; inserts always use the admin client. */
  supabase?: SupabaseClient;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
  senderId?: string;
  actionName?: string;
}

export async function sendNotification({
  recipientId,
  type,
  title,
  body,
  actionUrl,
  senderId,
  actionName = "sendNotification",
}: SendNotificationParams) {
  try {
    const admin = getAdminClient();
    const { error } = await admin.from("notifications").insert({
      recipient_id: recipientId,
      sender_id: senderId ?? null,
      type: toNotificationType(type),
      title,
      body,
      action_url: actionUrl ?? null,
      is_read: false,
    });

    if (error) {
      console.error(`${actionName}: failed to insert notification for recipient ${recipientId}:`, error.message);
    }
  } catch (err) {
    console.error(`${actionName}: notification insert threw for recipient ${recipientId}:`, err);
  }
}

interface NotifyJobCreatorParams {
  jobId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  /** Not persisted: notifications table has no metadata column. Logged on failure only. */
  metadata?: Record<string, unknown>;
  senderId?: string | null;
}

/**
 * Inserts ONE notification for job_postings.created_by of the given job.
 * Uses the admin client. Never throws into the calling action.
 */
export async function notifyJobCreator({
  jobId,
  type,
  title,
  body,
  link,
  metadata,
  senderId,
}: NotifyJobCreatorParams): Promise<void> {
  try {
    const admin = getAdminClient();
    const { data: job, error: jobError } = await admin
      .from("job_postings")
      .select("created_by")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      console.error(`notifyJobCreator: failed to load job ${jobId}:`, jobError.message, metadata ?? {});
      return;
    }

    const createdBy = (job as { created_by: string | null } | null)?.created_by ?? null;
    if (!createdBy) {
      console.error(`notifyJobCreator: job ${jobId} has no created_by; notification skipped`, metadata ?? {});
      return;
    }

    const { error } = await admin.from("notifications").insert({
      recipient_id: createdBy,
      sender_id: senderId ?? null,
      type: toNotificationType(type),
      title,
      body,
      action_url: link ?? null,
      is_read: false,
    });

    if (error) {
      console.error(`notifyJobCreator: failed to insert notification for job ${jobId}:`, error.message, metadata ?? {});
    }
  } catch (err) {
    console.error(`notifyJobCreator: threw for job ${jobId}:`, err);
  }
}

export interface NotifyTenantOfferDecisionMakersParams {
  tenantId: string | null | undefined;
  excludeUserId?: string | null;
  type?: string;
  title: string;
  body: string;
  actionUrl: string;
  senderId?: string | null;
  actionName?: string;
}

const OFFER_DECISION_MAKER_ROLES = new Set(["hr_admin", "hr_generalist"]);

/**
 * Queries all active tenant_members (`is_active = true`) for `tenantId` whose
 * `profiles.hr_role` is `'hr_admin'` or `'hr_generalist'` (falling back to
 * tenant-scoped `profiles` when `tenant_members` is unavailable or empty),
 * excludes `excludeUserId`, and dispatches shared notifications strictly within
 * `tenantId`. Never throws into the calling action.
 */
export async function notifyTenantOfferDecisionMakers({
  tenantId,
  excludeUserId,
  type = "offer_letter",
  title,
  body,
  actionUrl,
  senderId,
  actionName = "notifyTenantOfferDecisionMakers",
}: NotifyTenantOfferDecisionMakersParams): Promise<string[]> {
  const normalizedTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  if (!normalizedTenantId) {
    return [];
  }

  try {
    const admin = getAdminClient();
    const recipientSet = new Set<string>();
    let resolvedFromTenantMembers = false;

    try {
      const { data: memberRows, error: memberError } = await admin
        .from("tenant_members")
        .select("user_id, is_active, profiles!inner(id, hr_role)")
        .eq("tenant_id", normalizedTenantId)
        .eq("is_active", true);

      if (!memberError && Array.isArray(memberRows) && memberRows.length > 0) {
        resolvedFromTenantMembers = true;
        for (const row of memberRows as Array<{
          user_id?: string | null;
          profiles?:
            | { id?: string | null; hr_role?: string | null }
            | Array<{ id?: string | null; hr_role?: string | null }>
            | null;
        }>) {
          const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          const hrRole = typeof prof?.hr_role === "string" ? prof.hr_role.trim() : "";
          const recipientId = prof?.id ?? row.user_id ?? null;
          if (recipientId && OFFER_DECISION_MAKER_ROLES.has(hrRole)) {
            recipientSet.add(recipientId);
          }
        }
      }
    } catch {
      // Fallback to tenant-scoped profiles query below when tenant_members is not present.
    }

    if (!resolvedFromTenantMembers) {
      const { data: profileRows, error: profileError } = await admin
        .from("profiles")
        .select("id, hr_role, is_tenant_owner")
        .eq("tenant_id", normalizedTenantId)
        .in("role", ["hr_manager", "admin", "hr"]);

      if (profileError) {
        console.error(
          `${actionName}: failed to query tenant HR decision makers for tenant ${normalizedTenantId}:`,
          profileError.message
        );
        return [];
      }

      for (const row of (profileRows ?? []) as Array<{
        id?: string | null;
        hr_role?: string | null;
        is_tenant_owner?: boolean | null;
      }>) {
        const effectiveRole =
          typeof row.hr_role === "string" && row.hr_role.trim()
            ? row.hr_role.trim()
            : row.is_tenant_owner
              ? "hr_admin"
              : "";
        if (
          row.id &&
          (OFFER_DECISION_MAKER_ROLES.has(effectiveRole) || Boolean(row.is_tenant_owner))
        ) {
          recipientSet.add(row.id);
        }
      }
    }

    // Fallback for single-account DevRoleToggle testing: if no hr_admin/hr_generalist
    // was found (e.g., sole tenant HR user temporarily toggled to recruiter), include
    // the triggering sender so they receive the handover alert when switching back.
    if (recipientSet.size === 0 && senderId) {
      recipientSet.add(senderId);
    }

    // Only exclude the triggering actor in production when at least one OTHER active
    // HR decision maker exists in the tenant, so single-account / DevRoleToggle testing
    // never drops handover notifications.
    const isDevEnvironment = process.env.NODE_ENV !== "production";
    if (excludeUserId && !isDevEnvironment && recipientSet.size > 1) {
      recipientSet.delete(excludeUserId);
    }

    const recipientIds = Array.from(recipientSet);
    if (recipientIds.length === 0) {
      return [];
    }

    await Promise.all(
      recipientIds.map((recipientId) =>
        sendNotification({
          recipientId,
          senderId: senderId ?? undefined,
          type,
          title,
          body,
          actionUrl,
          actionName,
        })
      )
    );

    return recipientIds;
  } catch (err) {
    console.error(`${actionName}: failed for tenant ${normalizedTenantId}:`, err);
    return [];
  }
}