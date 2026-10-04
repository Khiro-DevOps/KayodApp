import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Profile } from "@/lib/types";
import { effectiveRole, roleLabel, isHRRole } from "@/lib/roles";
import ProfileDetailsForm from "@/app/(pwa)/applicant/profile/profile-details-form";
import NotificationPreferencesCard from "@/components/profile/NotificationPreferencesCard";
import { logout } from "@/app/(auth)/actions";
import Link from "next/link";

export default async function HRProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, tenants(name)")
    .eq("id", user.id)
    .maybeSingle<Profile & { tenants?: { name?: string | null } | null }>();

  const effective = effectiveRole(profile?.role, authRole);
  if (!isHRRole(effective)) {
    redirect("/dashboard");
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || user.email || "HR Manager";
  const displayEmail = profile?.email || user.email || "";
  const displayPhone = profile?.phone || "No phone provided";
  const companyName = profile?.tenants?.name ?? "Kayod HR Workspace";

  return (
    <PageContainer>
      <div className="space-y-7">
        <h1 className="border-b border-border pb-5 font-h1 text-2xl font-bold text-text-main">
          HR Account Profile
        </h1>

        {/* HR Profile Overview Card */}
        <div className="space-y-5 rounded-xl border border-border bg-card-bg p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white font-bold text-xl shadow-xs">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg text-text-main truncate">{displayName}</p>
              <p className="text-sm text-text-muted truncate">{displayEmail}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-semibold text-primary-dark capitalize">
                  {roleLabel(effective)}
                </span>
                <span className="text-xs text-text-muted">• {companyName}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-border">
            <div className="rounded-lg bg-surface-bg border border-border/50 p-3">
              <p className="text-xs text-text-muted">Full Name</p>
              <p className="text-sm font-medium text-text-main mt-0.5">{displayName}</p>
            </div>
            <div className="rounded-lg bg-surface-bg border border-border/50 p-3">
              <p className="text-xs text-text-muted">Email Address</p>
              <p className="text-sm font-medium text-text-main mt-0.5">{displayEmail}</p>
            </div>
            <div className="rounded-lg bg-surface-bg border border-border/50 p-3">
              <p className="text-xs text-text-muted">Contact Phone</p>
              <p className="text-sm font-medium text-text-main mt-0.5">{displayPhone}</p>
            </div>
          </div>
        </div>

        {/* Editable Personal Details */}
        <ProfileDetailsForm profile={profile ?? null} />

        {/* Notification Preferences */}
        <NotificationPreferencesCard
          initialEmail={profile?.email_notifications ?? true}
          initialPush={profile?.push_notifications ?? true}
        />

        {/* HR Navigation Quick Links */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide px-1">
            HR Quick Management
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card-bg shadow-sm">
            <Link
              href="/hr/applicants"
              className="flex items-center justify-between px-4 py-3.5 text-sm text-text-main hover:bg-surface-bg transition-colors"
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 16 }}>📑</span>
                <span>Manage Applicants</span>
              </div>
              <span className="text-xs font-medium text-primary">View →</span>
            </Link>
            <Link
              href="/hr/jobs/manage"
              className="flex items-center justify-between px-4 py-3.5 text-sm text-text-main hover:bg-surface-bg transition-colors"
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 16 }}>💼</span>
                <span>Manage Job Postings</span>
              </div>
              <span className="text-xs font-medium text-primary">View →</span>
            </Link>
            <Link
              href="/hr/payroll"
              className="flex items-center justify-between px-4 py-3.5 text-sm text-text-main hover:bg-surface-bg transition-colors"
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 16 }}>💰</span>
                <span>Payroll</span>
              </div>
              <span className="text-xs font-medium text-primary">View →</span>
            </Link>
            <Link
              href="/hr/schedules"
              className="flex items-center justify-between px-4 py-3.5 text-sm text-text-main hover:bg-surface-bg transition-colors"
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 16 }}>🗓️</span>
                <span>Team Schedules</span>
              </div>
              <span className="text-xs font-medium text-primary">View →</span>
            </Link>
            <Link
              href="/hr/leaves"
              className="flex items-center justify-between px-4 py-3.5 text-sm text-text-main hover:bg-surface-bg transition-colors"
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 16 }}>🏖️</span>
                <span>Leave Requests</span>
              </div>
              <span className="text-xs font-medium text-primary">View →</span>
            </Link>
          </div>
        </div>

        {/* Logout Form */}
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-lg border border-error/30 py-3 text-sm font-semibold text-error hover:bg-error-bg transition-colors"
          >
            Log Out
          </button>
        </form>
      </div>
    </PageContainer>
  );
}
