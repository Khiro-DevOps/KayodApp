import { SupabaseClient } from "@supabase/supabase-js";

interface SendNotificationParams {
  supabase: SupabaseClient;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
  senderId?: string;
}

export async function sendNotification({
  supabase,
  recipientId,
  type,
  title,
  body,
  actionUrl,
  senderId,
}: SendNotificationParams) {
  const { error } = await supabase.from("notifications").insert({
    recipient_id: recipientId,
    sender_id: senderId ?? null,
    type,
    title,
    body,
    action_url: actionUrl ?? null,
    is_read: false,
  });

  if (error) {
    console.error("Failed to send notification:", error.message);
  }
}