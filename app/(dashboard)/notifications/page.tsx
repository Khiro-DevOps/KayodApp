import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Notification } from "@/lib/types";
import NotificationsClient from "./notifications-client";

export default async function NotificationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Notification[]>();

  const unreadCount =
    notifications?.filter((n) => !n.is_read).length || 0;

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

        <NotificationsClient notifications={notifications || []} />

        {(!notifications || notifications.length === 0) && (
          <div className="rounded-2xl bg-surface border border-border p-6 text-center space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-text-secondary">
                <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm text-text-secondary">No notifications yet</p>
            <p className="text-xs text-text-secondary">
              You&apos;ll be notified about application updates here
            </p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
