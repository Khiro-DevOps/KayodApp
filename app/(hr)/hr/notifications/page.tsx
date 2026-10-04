import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Notification } from "@/lib/types";
import NotificationsClient from "@/app/(pwa)/applicant/notifications/notifications-client";
import { effectiveRole, isHRRole } from "@/lib/roles";

export default async function HRNotificationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) {
    redirect("/dashboard");
  }

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Notification[]>();

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-h1 text-2xl font-bold text-text-main">
              HR Notifications
            </h1>
            <p className="text-xs text-text-muted">
              Alerts regarding job applications, interview schedules, contracts, and leave requests
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {unreadCount} new
            </span>
          )}
        </div>

        {!notifications || notifications.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed border-border bg-card-bg p-10 text-center shadow-sm">
            <p className="text-sm text-text-muted">No HR notifications yet</p>
            <p className="text-xs text-text-muted">
              You&apos;ll receive updates when applicants submit forms, book interviews, or accept job offers.
            </p>
          </div>
        ) : (
          <NotificationsClient notifications={notifications ?? []} />
        )}
      </div>
    </PageContainer>
  );
}
