import { createClient } from "@/lib/supabase/server";
import { requireHrPermission } from "@/lib/rbac/server";
import PageContainer from "@/components/ui/page-container";
import BranchManager from "./branch-manager";
import type { OfficeBranch } from "@/lib/types";
import { PageHeroHeader } from "@/components/ui/option-b-surfaces";
import TeamHrInvitesCard from "@/components/hr/TeamHrInvitesCard";
import { listPendingHrInvitesAction } from "@/app/(hr)/hr/profile/invite-actions";

export default async function BranchesSettingsPage() {
  const ctx = await requireHrPermission("settings:view");
  const supabase = await createClient();

  const isTenantOwner = ctx.is_tenant_owner;
  const pendingInvitesResult = isTenantOwner ? await listPendingHrInvitesAction() : null;
  const pendingInvites = pendingInvitesResult?.invites ?? [];

  let branchesQuery = supabase
    .from("office_branches")
    .select("*")
    .order("created_at", { ascending: false });
  if (ctx.tenant_id) {
    branchesQuery = branchesQuery.eq("tenant_id", ctx.tenant_id);
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
