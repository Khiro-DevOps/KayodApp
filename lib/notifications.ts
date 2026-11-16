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