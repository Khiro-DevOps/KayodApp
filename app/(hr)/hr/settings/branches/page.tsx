import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import BranchManager from "./branch-manager";
import type { OfficeBranch } from "@/lib/types";
import { PageHeroHeader } from "@/components/ui/option-b-surfaces";
import TeamHrInvitesCard from "@/components/hr/TeamHrInvitesCard";
import { listPendingHrInvitesAction } from "@/app/(hr)/hr/profile/invite-actions";

export default async function BranchesSettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id, is_tenant_owner")
    .eq("id", user.id)
    .single<{ role?: string | null; tenant_id?: string | null; is_tenant_owner?: boolean | null }>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";
  if (!isHR) redirect("/dashboard");

  const isTenantOwner = Boolean(profile?.is_tenant_owner);
  const pendingInvitesResult = isTenantOwner ? await listPendingHrInvitesAction() : null;
  const pendingInvites = pendingInvitesResult?.invites ?? [];

  let branchesQuery = supabase
    .from("office_branches")
    .select("*")
    .order("created_at", { ascending: false });
  if (profile?.tenant_id) {
    branchesQuery = branchesQuery.eq("tenant_id", profile.tenant_id);
  }
  const { data: branches } = await branchesQuery.returns<OfficeBranch[]>();

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeroHeader
          eyebrow="Workspace Settings"
          title="Office Branches"
          subtitle="Manage your company's physical office locations for attendance tracking."
        />
        {isTenantOwner ? (
          <TeamHrInvitesCard initialInvites={pendingInvites} />
        ) : null}
        <BranchManager initialBranches={branches || []} />
      </div>
    </PageContainer>
  );
}
