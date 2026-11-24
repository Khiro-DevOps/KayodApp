import { createClient } from "@/lib/supabase/server";
import { requireHrPermission } from "@/lib/rbac/server";
import PageContainer from "@/components/ui/page-container";
import BranchManager from "./branch-manager";
import type { OfficeBranch } from "@/lib/types";
import { canHr } from "@/lib/rbac/permissions";
import { PageHeroHeader } from "@/components/ui/option-b-surfaces";
import TeamHrInvitesCard from "@/components/hr/TeamHrInvitesCard";
import HrTeamMembersCard from "@/components/hr/HrTeamMembersCard";
import {
  listHrTeamMembersAction,
  listPendingHrInvitesAction,
} from "@/app/(hr)/hr/profile/invite-actions";

export default async function BranchesSettingsPage() {
  const ctx = await requireHrPermission("settings:view");
  const supabase = await createClient();

  const canManageRoles = canHr(
    ctx.hr_role,
    "settings:manage_roles",
    ctx.is_tenant_owner
  );
  const [pendingInvitesResult, teamMembersResult] = await Promise.all([
    canManageRoles ? listPendingHrInvitesAction() : Promise.resolve(null),
    listHrTeamMembersAction(),
  ]);
  const pendingInvites = pendingInvitesResult?.invites ?? [];
  const teamMembers = teamMembersResult.members ?? [];

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
        {canManageRoles ? (
          <TeamHrInvitesCard initialInvites={pendingInvites} />
        ) : null}
        <HrTeamMembersCard
          initialMembers={teamMembers}
          currentUserId={ctx.id}
          canManageRoles={canManageRoles}
        />
        <BranchManager initialBranches={branches || []} />
      </div>
    </PageContainer>
  );
}
