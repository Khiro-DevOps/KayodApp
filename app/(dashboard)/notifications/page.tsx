import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Notification } from "@/lib/types";
import Link from "next/link";

export default async function NotificationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Notification[]>();

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;

  // Mark all as read
  if (unreadCount > 0) {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", user.id)
      .eq("is_read", false);
  }

  const typeIcons: Record<string, string> = {
    application_submitted:      "📄",
    application_status_changed: "📋",
    interview_scheduled:        "📅",
    interview_reminder:         "⏰",
    interview_cancelled:        "❌",
    offer_letter:               "📨",
    leave_status_changed:       "🏖️",
    payroll_processed:          "💰",
    schedule_published:         "🗓️",
    general:                    "🔔",
  };

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {unreadCount} new
            </span>
          )}
        </div>

        {!notifications || notifications.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-border p-6 text-center space-y-2">
            <p className="text-sm text-text-secondary">No notifications yet</p>
            <p className="text-xs text-text-secondary">
              You&apos;ll be notified about application updates, interviews, and more
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => (
              <Link
                key={notif.id}
                href={notif.action_url ?? "#"}
                className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors hover:bg-gray-50 ${
                  !notif.is_read
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-surface"
                }`}
              >
                <span className="text-xl shrink-0" style={{ fontSize: 18 }}>
                  {typeIcons[notif.type] ?? "🔔"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {notif.title}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {notif.body}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    {new Date(notif.created_at).toLocaleDateString("en-PH", {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "numeric", minute: "2-digit"
                    })}
                  </p>
                </div>
                {!notif.is_read && (
                  <div className="h-2 w-2 shrink-0 rounded-full bg-primary mt-1" />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}