import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/notifications/register-device
 * Register a device token for push notifications (FCM)
 *
 * Body: {
 *   deviceToken: string;
 *   deviceType: "web" | "ios" | "android";
 *   deviceName?: string;
 * }
 * Requires: Authenticated user
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deviceToken, deviceType, deviceName } = await req.json();

    if (!deviceToken || !deviceType) {
      return NextResponse.json(
        { error: "Missing required fields: deviceToken, deviceType" },
        { status: 400 }
      );
    }

    if (!["web", "ios", "android"].includes(deviceType)) {
      return NextResponse.json(
        { error: "Invalid deviceType. Must be: web, ios, or android" },
        { status: 400 }
      );
    }

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

      return NextResponse.json(
        {
          success: true,
          message: "Device token updated",
          isNew: false,
        },
        { status: 200 }
      );
    }

    // Insert new token
    const { data: newToken, error: insertError } = await supabase
      .from("fcm_device_tokens")
      .insert({
        user_id: user.id,
        device_token: deviceToken,
        device_type: deviceType,
        device_name: deviceName || null,
        is_active: true,
      })
      .select();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to register device: " + insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Device registered for push notifications",
        isNew: true,
        token: newToken?.[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Device registration error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
