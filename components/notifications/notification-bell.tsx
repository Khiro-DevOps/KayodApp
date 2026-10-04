"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

function getNotificationIcon(type: string) {
  switch (type) {
    case "application_submitted":
    case "application_status_changed":
      return "person_search";
    case "interview_scheduled":
    case "interview_rescheduled":
    case "interview_reminder":
    case "interview_cancelled":
      return "calendar_today";
    case "offer_letter":
    case "offer_sent":
    case "offer_accepted":
    case "offer_declined":
    case "offer_negotiation_submitted":
    case "offer_negotiation_responded":
    case "hire_confirmed":
      return "description";
    case "leave_status_changed":
      return "beach_access";
    case "payroll_processed":
      return "payments";
    case "schedule_published":
      return "schedule";
    default:
      return "notifications";
  }
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationBell({ userId }: { userId?: string | null }) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(userId ?? null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const fetchNotifications = async (targetUserId: string) => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", targetUserId)
          .maybeSingle();

        const isEmployee = profile?.role === "employee";

        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("recipient_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (!error && data && isMounted) {
          let items = data as Notification[];
          if (isEmployee) {
            const employeeTypes = [
              "welcome",
              "leave_status_changed",
              "payroll_processed",
              "schedule_published",
              "general",
            ];
            items = items.filter((n) => employeeTypes.includes(n.type));
          }
          setNotifications(items);
        }
      } catch {
        // fail silently if notifications table non-existent or restricted
      }
    };

    const initUserAndFetch = async () => {
      let activeUserId = userId;
      if (!activeUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          activeUserId = user.id;
        }
      }

      if (!activeUserId || !isMounted) return;
      setCurrentUserId(activeUserId);

      void fetchNotifications(activeUserId);

      const channel = supabase
        .channel(`realtime-hr-notifications-${activeUserId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${activeUserId}`,
          },
          () => {
            if (activeUserId) {
              void fetchNotifications(activeUserId);
            }
          }
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    };

    let cleanupFn: (() => void) | undefined;
    initUserAndFetch().then((cleanup) => {
      cleanupFn = cleanup;
    });

    return () => {
      isMounted = false;
      if (cleanupFn) cleanupFn();
    };
  }, [userId]);

  // Handle outside click to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (notification: Notification) => {
    if (!currentUserId) return;
    if (!notification.is_read) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );

      const supabase = createClient();
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notification.id)
        .eq("recipient_id", currentUserId);
    }

    setIsOpen(false);
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  const handleMarkAllRead = async () => {
    if (!currentUserId || unreadCount === 0) return;

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at || new Date().toISOString() }))
    );

    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", currentUserId)
      .eq("is_read", false);
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 text-white/80 hover:bg-white/10 rounded-full relative transition-colors flex items-center justify-center"
        title="Notifications"
        aria-expanded={isOpen}
      >
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-error text-[9px] font-bold text-white shadow-xs">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white shadow-xl rounded-2xl border border-gray-100 z-50 overflow-hidden text-gray-900">
          {/* Header Bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-[20px]">notifications_off</span>
                </div>
                <p className="text-xs font-medium text-gray-700">You&apos;re all caught up!</p>
                <p className="text-[11px] text-gray-500">No unread notifications.</p>
              </div>
            ) : (
              notifications.map((item) => {
                const iconName = getNotificationIcon(item.type);
                const relativeTime = getRelativeTime(item.created_at);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleMarkAsRead(item)}
                    className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors hover:bg-gray-50 ${
                      !item.is_read ? "bg-blue-50/30" : ""
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-gray-100 text-gray-600 shrink-0 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">{iconName}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className={`text-xs truncate ${!item.is_read ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                          {item.title}
                        </p>
                        <span className="text-[10px] text-gray-400 shrink-0">{relativeTime}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                        {item.body}
                      </p>
                    </div>

                    {!item.is_read && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

