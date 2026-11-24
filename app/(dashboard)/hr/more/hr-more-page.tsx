import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { canHr, HR_ROLE_LABELS } from "@/lib/rbac/permissions";
import { getHrSessionContext } from "@/lib/rbac/server";

export default async function HRMorePage() {
  const ctx = await getHrSessionContext();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", ctx.id)
    .single<Profile>();

  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : "HR Manager";

  return (
    <PageContainer>
      <div className="space-y-5">
        {/* Profile header */}
        <div className="flex items-center gap-4 rounded-2xl bg-surface border border-border p-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-text-primary">{fullName}</p>
            <p className="text-xs text-text-secondary capitalize">
              {HR_ROLE_LABELS[ctx.hr_role]}
            </p>
            <p className="text-xs text-text-tertiary">{profile?.email}</p>
          </div>
        </div>

        {/* HR Tools */}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide px-1">
            HR Tools
          </p>
          <div className="rounded-2xl bg-surface border border-border overflow-hidden divide-y divide-border">
            {canHr(ctx.hr_role, "jobs:view", ctx.is_tenant_owner) && (
              <MenuLink href="/hr/jobs" label="Manage job postings" emoji="💼" />
            )}
            {canHr(ctx.hr_role, "jobs:manage", ctx.is_tenant_owner) && (
              <MenuLink href="/hr/jobs/new" label="Post a new job" emoji="➕" />
            )}
            {canHr(ctx.hr_role, "payroll:manage", ctx.is_tenant_owner) && (
              <MenuLink href="/hr/payroll" label="Payroll" emoji="💰" />
            )}
            {canHr(ctx.hr_role, "attendance:view", ctx.is_tenant_owner) && (
              <MenuLink href="/hr/schedules" label="Employee schedules" emoji="🗓️" />
            )}
            {canHr(ctx.hr_role, "leaves:view", ctx.is_tenant_owner) && (
              <MenuLink href="/hr/leaves" label="Leave requests" emoji="🏖️" />
            )}
            <MenuLink href="/hr/notifications" label="Notifications" emoji="🔔" />
          </div>
        </section>

        {/* Account */}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide px-1">
            Account
          </p>
          <div className="rounded-2xl bg-surface border border-border overflow-hidden divide-y divide-border">
            <MenuLink href="/hr/profile" label="My profile" emoji="👤" />
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <span style={{ fontSize: 16 }}>🚪</span>
                <span>Log out</span>
              </button>
            </form>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}

function MenuLink({
  href,
  label,
  emoji,
}: {
  href: string;
  label: string;
  emoji: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <span>{label}</span>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-tertiary">
        <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
      </svg>
    </Link>
  );
}
