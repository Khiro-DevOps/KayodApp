import { SupabaseClient } from "@supabase/supabase-js";

interface SendNotificationParams {
  supabase: SupabaseClient;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
  senderId?: string;
  sendPush?: boolean; // Whether to attempt push notification
}

interface SendPushNotificationParams {
  recipientId: string;
  title: string;
  body: string;
  actionUrl?: string;
}

/**
 * Send in-app notification to Supabase database
 */
export async function sendNotification({
  supabase,
  recipientId,
  type,
  title,
  body,
  actionUrl,
  senderId,
  sendPush = true,
}: SendNotificationParams) {
  // Store in-app notification
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

  // Attempt to send push notification if enabled
  if (sendPush) {
    await sendPushNotification({ recipientId, title, body, actionUrl });
  }
}

/**
 * Send push notification via FCM (browser/mobile)
 * Requires Firebase Cloud Messaging setup
 */
export async function sendPushNotification({
  recipientId,
  title,
  body,
  actionUrl,
}: SendPushNotificationParams) {
  try {
    // Only works on server-side with Firebase Admin SDK
    // Check if we're in server environment
    if (typeof window !== "undefined") {
      console.log("Push notifications only supported on server");
      return;
    }

    // This will be implemented with Firebase Admin SDK on the server
    // For now, this is a placeholder
    console.log(`[Push Notification] ${title}: ${body}`);
  } catch (error) {
    console.error("Failed to send push notification:", error);
  }
}

/**
 * Register device token for push notifications (client-side)
 * Call this from browser when FCM token is ready
 */
export async function registerDeviceToken(
  supabase: SupabaseClient,
  deviceToken: string,
  deviceType: "web" | "ios" | "android",
  deviceName?: string
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Check if token already exists
    const { data: existing } = await supabase
      .from("fcm_device_tokens")
      .select("id")
      .eq("device_token", deviceToken)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      // Update last_used_at
      await supabase
        .from("fcm_device_tokens")
        .update({
          last_used_at: new Date().toISOString(),
          is_active: true,
        })
        .eq("id", existing.id);
    } else {
      // Insert new token
      await supabase.from("fcm_device_tokens").insert({
        user_id: user.id,
        device_token: deviceToken,
        device_type: deviceType,
        device_name: deviceName,
        is_active: true,
      });
    }
  } catch (error) {
    console.error("Failed to register device token:", error);
  }
}