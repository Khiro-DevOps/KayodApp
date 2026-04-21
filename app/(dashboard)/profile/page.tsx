import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logout } from "@/app/(auth)/actions";
import PageContainer from "@/components/ui/page-container";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { effectiveRole, roleLabel, isCandidateRole } from "@/lib/roles";
import ProfileDetailsForm from "./profile-details-form";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const authRole = (user.user_metadata?.role ?? user.raw_user_meta_data?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  const effective = effectiveRole(profile?.role, authRole);

  return (
    <PageContainer>
      <div className="space-y-6">
        <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
          Profile
        </h1>

        {/* User Info Card */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
              {profile?.first_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="flex-1">
              <p className="font-medium text-text-primary">
                {profile?.first_name && profile?.last_name
                  ? `${profile.first_name} ${profile.last_name}`
                  : profile?.email}
              </p>
              <p className="text-sm text-text-secondary">{profile?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="rounded-xl bg-background p-3">
              <p className="text-xs text-text-secondary">Account Type</p>
              <p className="text-sm font-medium text-text-primary capitalize">
                {roleLabel(effective)}
              </p>
            </div>
          </div>
        </div>

        <ProfileDetailsForm profile={profile ?? null} />

        {/* Role-specific links */}
        {isCandidateRole(effective) && (
          <Link
            href="/resume"
            className="flex items-center justify-between rounded-2xl bg-surface border border-border p-4 text-sm font-medium text-text-primary hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Z" />
                </svg>
              </div>
              My Resumes
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-text-secondary">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
        )}

        {(effective === "hr_manager" || effective === "admin") && (
          <div className="rounded-2xl bg-surface border border-border overflow-hidden divide-y divide-border">
            <Link
              href="/applications"
              className="flex items-center justify-between px-4 py-3.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 16 }}>👥</span>
                <span>Manage Applicants</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-secondary">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </Link>
            <Link
              href="/payroll"
              className="flex items-center justify-between px-4 py-3.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 16 }}>💰</span>
                <span>Payroll</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-secondary">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </Link>
            <Link
              href="/schedules"
              className="flex items-center justify-between px-4 py-3.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 16 }}>🗓️</span>
                <span>Schedules</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-secondary">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        )}

        {/* Logout */}
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-2xl border border-danger py-3 text-sm font-medium text-danger transition-colors hover:bg-red-50"
          >
            Log Out
          </button>
        </form>
      </div>
    </PageContainer>
  );
}
