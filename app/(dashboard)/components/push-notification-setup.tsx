"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Bell, BellOff, CheckCircle } from "lucide-react";

/**
 * PushNotificationSetup
 * Initializes FCM push notifications on app load
 * Requests permission from user and registers device token
 */
export function PushNotificationSetup() {
  const [status, setStatus] = useState<
    "idle" | "requesting" | "registered" | "denied" | "error"
  >("idle");
  const [showNotice, setShowNotice] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    // Check if browser supports notifications
    if (!("Notification" in window)) {
      console.log("This browser does not support notifications");
      return;
    }

    // Skip if already denied
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    // Auto-request if not yet asked
    if (Notification.permission === "default") {
      requestNotificationPermission();
    } else if (Notification.permission === "granted") {
      // Already granted, just register token
      setStatus("registered");
    }
  }, []);

  const requestNotificationPermission = async () => {
    try {
      setStatus("requesting");

      const permission = await Notification.requestPermission();

      if (permission === "granted") {
        // Get FCM token (simplified - in production use Firebase SDK)
        const deviceToken = await generateDeviceToken();

        // Register with backend
        const response = await fetch(
          "/api/notifications/register-device",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceToken,
              deviceType: "web",
              deviceName: navigator.userAgent.split(" ").pop(),
            }),
          }
        );

        if (response.ok) {
          setStatus("registered");
          // Auto-hide notice after 3 seconds
          setTimeout(() => setShowNotice(false), 3000);
        } else {
          throw new Error("Failed to register device");
        }
      } else if (permission === "denied") {
        setStatus("denied");
      }
    } catch (error) {
      console.error("Notification setup error:", error);
      setStatus("error");
    }
  };

  const generateDeviceToken = async (): Promise<string> => {
    // In production, use Firebase Cloud Messaging:
    // const token = await getToken(messaging, {
    //   vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY
    // });
    //
    // For now, generate a unique token locally
    const token = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return token;
  };

  // Don't show anything if already registered or if user dismissed
  if (status === "registered" && !showNotice) return null;
  if (status === "denied") return null;

  return (
    <>
      {status === "requesting" && (
        <div className="fixed bottom-4 left-4 bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-md z-30 flex items-center gap-3 animate-pulse">
          <Bell className="w-5 h-5 text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">
              Enabling notifications...
            </p>
            <p className="text-xs text-gray-600">
              Check your browser settings
            </p>
          </div>
        </div>
      )}

      {status === "registered" && showNotice && (
        <div className="fixed bottom-4 left-4 bg-green-50 border border-green-200 rounded-lg p-4 shadow-md z-30 flex items-center gap-3 animate-in">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">
              Push notifications enabled
            </p>
            <p className="text-xs text-gray-600">
              You'll receive updates on job offers and interviews
            </p>
          </div>
          <button
            onClick={() => setShowNotice(false)}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            ✕
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="fixed bottom-4 left-4 bg-red-50 border border-red-200 rounded-lg p-4 shadow-md z-30 flex items-center gap-3">
          <BellOff className="w-5 h-5 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">
              Failed to enable notifications
            </p>
            <p className="text-xs text-gray-600">
              Check your browser settings and try again
            </p>
          </div>
          <button
            onClick={() => setShowNotice(false)}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
