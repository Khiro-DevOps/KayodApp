"use client";

import type { Notification } from "@/lib/types";
import Link from "next/link";
import { markNotificationRead, markAllNotificationsRead } from "./actions";

const typeConfig: Record<
  string,
  { icon: string; accent: string; bg: string }
> = {
  apply: { icon: "📄", accent: "text-info", bg: "bg-blue-50" },
  shortlist: { icon: "⭐", accent: "text-warning", bg: "bg-yellow-50" },
  interview: { icon: "📅", accent: "text-purple-600", bg: "bg-purple-50" },
  hire: { icon: "🎉", accent: "text-success", bg: "bg-green-50" },
};

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationsClient({
  notifications,
}: {
  notifications: Notification[];
}) {
  if (notifications.length === 0) return null;

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <div className="space-y-3">
      {hasUnread && (
        <form action={markAllNotificationsRead} className="flex justify-end">
          <button
            type="submit"
            className="text-xs font-medium text-primary hover:underline"
          >
            Mark all as read
          </button>
        </form>
      )}

      {notifications.map((notif) => {
        const config = typeConfig[notif.type] || typeConfig.apply;

        return (
          <div
            key={notif.id}
            className={`rounded-2xl border p-4 transition-colors ${
              notif.is_read
                ? "bg-surface border-border"
                : "bg-white border-primary/20 shadow-sm"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${config.bg}`}
              >
                {config.icon}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className={`text-sm ${
                    notif.is_read
                      ? "text-text-secondary"
                      : "text-text-primary font-medium"
                  }`}
                >
                  {notif.body}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-text-secondary">
                    {timeAgo(notif.created_at)}
                  </p>
                  <div className="flex items-center gap-3">
                    {notif.action_url && (
                      <Link
                        href={notif.action_url}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View
                      </Link>
                    )}
                    {!notif.is_read && (
                      <form action={markNotificationRead}>
                        <input
                          type="hidden"
                          name="notification_id"
                          value={notif.id}
                        />
                        <button
                          type="submit"
                          className="text-xs text-text-secondary hover:text-text-primary"
                        >
                          Mark read
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
              {!notif.is_read && (
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
