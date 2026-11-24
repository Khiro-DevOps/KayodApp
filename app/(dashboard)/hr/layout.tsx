import { createClient } from "@/lib/supabase/server";
import { getHrSessionContext } from "@/lib/rbac/server";
import { resolveEffectiveHrRole, type HrSubRole } from "@/lib/rbac/permissions";
import HrDashboardShell from "./hr-dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getHrSessionContext();

  let initialHrRole: HrSubRole = ctx?.hr_role ?? "hr_admin";
  let initialIsTenantOwner = ctx?.is_tenant_owner ?? false;
  let initialDisplayName = "Admin User";
  let initialCompanyName = "Company";
  let initialAvatarUrl: string | null = null;

  if (ctx) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, avatar_url, tenant_id, hr_role, is_tenant_owner, tenants(name)")
      .eq("id", ctx.id)
      .maybeSingle<{
        first_name?: string | null;
        last_name?: string | null;
        avatar_url?: string | null;
        tenant_id?: string | null;
        hr_role?: string | null;
        is_tenant_owner?: boolean | null;
        tenants?: { name?: string | null } | Array<{ name?: string | null }> | null;
      }>();

    if (profile) {
      initialIsTenantOwner = Boolean(profile.is_tenant_owner);
      initialHrRole = resolveEffectiveHrRole(profile.hr_role, initialIsTenantOwner);
      initialDisplayName =
        [profile.first_name ?? "", profile.last_name ?? ""]
          .filter(Boolean)
          .join(" ") || "Admin User";
      initialAvatarUrl = profile.avatar_url ?? null;

      const tenantRel = Array.isArray(profile.tenants)
        ? profile.tenants[0]
        : profile.tenants;
      let resolvedCompany = tenantRel?.name?.trim() || "";
      if (!resolvedCompany && profile.tenant_id) {
        const { data: tenantRow } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", profile.tenant_id)
          .maybeSingle<{ name?: string | null }>();
        resolvedCompany = tenantRow?.name?.trim() || "";
      }
      initialCompanyName = resolvedCompany || "Company";
    }
  }

  return (
    <HrDashboardShell
      initialHrRole={initialHrRole}
      initialIsTenantOwner={initialIsTenantOwner}
      initialDisplayName={initialDisplayName}
      initialCompanyName={initialCompanyName}
      initialAvatarUrl={initialAvatarUrl}
    >
      {children}
    </HrDashboardShell>
  );
}
