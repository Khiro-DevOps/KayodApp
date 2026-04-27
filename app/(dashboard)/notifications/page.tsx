import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Notification } from "@/lib/types";
import NotificationsClient from "./notifications-client";

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
          <NotificationsClient notifications={notifications ?? []} />
        )}
      </div>
    </PageContainer>
  );
}