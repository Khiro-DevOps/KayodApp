"use client";

import { useState, useTransition } from "react";
import { Crown, Loader2, Shield, Users } from "lucide-react";
import {
  updateHrMemberRoleAction,
  type HrTeamMember,
} from "@/app/(hr)/hr/profile/invite-actions";
import {
  HR_ROLE_LABELS,
  HR_SUB_ROLES,
  resolveEffectiveHrRole,
  type HrSubRole,
} from "@/lib/rbac/permissions";

type HrTeamMembersCardProps = {
  initialMembers: HrTeamMember[];
  currentUserId: string;
  canManageRoles: boolean;
};

export default function HrTeamMembersCard({
  initialMembers,
  currentUserId,
  canManageRoles,
}: HrTeamMembersCardProps) {
  const [members, setMembers] = useState<HrTeamMember[]>(initialMembers);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleRoleChange(member: HrTeamMember, nextRole: HrSubRole) {
    if (member.hr_role === nextRole) return;

    setError(null);
    setStatusMessage(null);
    setUpdatingId(member.id);

    startTransition(async () => {
      const res = await updateHrMemberRoleAction(member.id, nextRole);
      setUpdatingId(null);

      if (!res.success || !res.member) {
        setError(res.error || "Failed to update team member role.");
        return;
      }

      setMembers((prev) =>
        prev.map((item) => (item.id === res.member!.id ? res.member! : item))
      );
      const memberName =
        [res.member.first_name, res.member.last_name].filter(Boolean).join(" ") ||
        res.member.email ||
        "Team member";
      setStatusMessage(
        `Updated ${memberName} to ${HR_ROLE_LABELS[res.member.hr_role]}.`
      );
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card-bg p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-main">HR Team Members</h2>
            <p className="text-xs text-text-muted">
              {canManageRoles
                ? "Manage workspace roles for active HR teammates. Workspace owners retain HR Admin access."
                : "Active HR teammates and their assigned workspace roles."}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-surface-bg px-2.5 py-1 text-xs font-semibold text-text-muted border border-border">
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      ) : null}

      {statusMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {statusMessage}
        </div>
      ) : null}

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-bg/60 px-3 py-4 text-center text-xs text-text-muted">
          No active HR team members found.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-surface-bg">
          {members.map((member) => {
            const effectiveRole = resolveEffectiveHrRole(
              member.hr_role,
              member.is_tenant_owner
            );
            const fullName =
              [member.first_name, member.last_name].filter(Boolean).join(" ") ||
              member.email ||
              "HR Member";
            const isSelf = member.id === currentUserId;
            const isLockedOwner = member.is_tenant_owner;
            const isUpdating = updatingId === member.id;

            return (
              <div
                key={member.id}
                className="flex flex-col gap-2.5 px-3.5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-text-main">
                      {fullName}
                    </p>
                    {isSelf ? (
                      <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        You
                      </span>
                    ) : null}
                    {member.is_tenant_owner ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        <Crown className="h-3 w-3" />
                        Owner
                      </span>
                    ) : null}
                  </div>
                  {member.email ? (
                    <p className="truncate text-xs text-text-muted">{member.email}</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {canManageRoles && !isLockedOwner ? (
                    <div className="flex items-center gap-2">
                      {isUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : null}
                      <select
                        aria-label={`Workspace role for ${fullName}`}
                        value={effectiveRole}
                        disabled={isUpdating}
                        onChange={(e) =>
                          handleRoleChange(member, e.target.value as HrSubRole)
                        }
                        className="rounded-lg border border-border bg-card-bg px-2.5 py-1.5 text-xs font-medium text-text-main outline-none focus:border-primary disabled:opacity-60"
                      >
                        {HR_SUB_ROLES.map((roleKey) => (
                          <option key={roleKey} value={roleKey}>
                            {HR_ROLE_LABELS[roleKey]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span
                      title={
                        isLockedOwner
                          ? "Workspace owner must remain HR Admin"
                          : undefined
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
                    >
                      <Shield className="h-3 w-3" />
                      {HR_ROLE_LABELS[effectiveRole]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
