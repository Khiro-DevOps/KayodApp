"use client";

import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/types";
import { markNotificationRead, markAllNotificationsRead } from "./actions";

const typeConfig: Record<string, { icon: string; bg: string }> = {
  // Existing
  apply:                      { icon: "📄", bg: "bg-primary-light"   },
  shortlist:                  { icon: "⭐", bg: "bg-warning-bg" },
  interview:                  { icon: "📅", bg: "bg-primary-light" },
  hire:                       { icon: "🎉", bg: "bg-success-bg"  },

  // New — post-interview flow
  interview_scheduled:        { icon: "📅", bg: "bg-primary-light" },
  interview_rescheduled:      { icon: "🔄", bg: "bg-warning-bg" },
  interview_completed:        { icon: "✅", bg: "bg-surface-bg"   },
  application_status_changed: { icon: "🔔", bg: "bg-primary-light"   },
  under_review:               { icon: "🔍", bg: "bg-warning-bg"  },
  negotiating:                { icon: "📞", bg: "bg-primary-light" },
  offer_sent:                 { icon: "📨", bg: "bg-success-bg"  },
  offer_letter:               { icon: "📨", bg: "bg-success-bg"  },
  offer_accepted:             { icon: "🎉", bg: "bg-success-bg"  },
  offer_declined:             { icon: "❌", bg: "bg-error-bg"    },
  offer_expiring:             { icon: "⏰", bg: "bg-warning-bg"  },
  offer_expired:              { icon: "⏰", bg: "bg-surface-bg"   },
  rejected:                   { icon: "❌", bg: "bg-error-bg"    },
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
  const router = useRouter();

  const resolveActionUrl = (notif: Notification): string | null => {
    if (!notif.action_url) return null;

    // Backward compatibility: older rows may still point to /interviews/<id>.
    if (
      (notif.type === "interview_scheduled" || notif.type === "interview_rescheduled") &&
      /^\/interviews\/.+/.test(notif.action_url)
    ) {
      return "/applicant/interviews";
    }

    return notif.action_url;
  };

  if (notifications.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card-bg p-8 text-center shadow-xs">
        <p className="text-sm text-text-muted">No notifications yet.</p>
      </div>
    );
  }

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <div className="space-y-3">
      {hasUnread && (
        <form action={markAllNotificationsRead} className="flex justify-end">
          <button
            type="submit"
            className="text-xs font-medium text-primary hover:text-primary-hover hover:underline transition-colors"
          >
            Mark all as read
          </button>
        </form>
      )}

      {notifications.map((notif) => {
        const config = typeConfig[notif.type] ?? { icon: "🔔", bg: "bg-primary-light" };
        const isUnread = !notif.is_read;
        const actionUrl = resolveActionUrl(notif);

        const handleClick = async () => {
          if (isUnread) {
            const formData = new FormData();
            formData.append("notification_id", notif.id);

            if (actionUrl) {
              void markNotificationRead(formData);
              router.push(actionUrl);
              return;
            }

            await markNotificationRead(formData);
            router.refresh();
            return;
          }

          if (actionUrl) {
            router.push(actionUrl);
          }
        };

        return (
          <button
            key={notif.id}
            type="button"
            onClick={() => void handleClick()}
            className={`w-full rounded-xl border p-4 text-left transition-colors ${
              isUnread
                ? "bg-primary-light/40 border-primary/20 hover:bg-primary-light/60"
                : "bg-card-bg border-border hover:bg-surface-bg"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${config.bg}`}>
                {config.icon}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                {notif.title && (
                  <p className={`text-xs font-semibold ${isUnread ? "text-text-main" : "text-text-muted"}`}>
                    {notif.title}
                  </p>
                )}
                <p className={`text-sm ${isUnread ? "text-text-main" : "text-text-muted"}`}>
                  {notif.body}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-text-muted">
                    {timeAgo(notif.created_at)}
                  </p>
                  {actionUrl && (
                    <span className="text-xs font-medium text-primary">
                      View →
                    </span>
                  )}
                </div>
              </div>
              {isUnread && (
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}