"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  isHrSubRole,
  resolveEffectiveHrRole,
  type HrSubRole,
} from "@/lib/rbac/permissions";
import { requireHrPermission } from "@/lib/rbac/server";

export type PendingTenantInvite = {
  id: string;
  invited_email: string;
  invited_hr_role: HrSubRole;
  expires_at: string;
  created_at: string;
};

export type HrTeamMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  hr_role: HrSubRole;
  is_tenant_owner: boolean;
};

type RawPendingTenantInvite = {
  id: string;
  invited_email: string;
  invited_hr_role: string | null;
  expires_at: string;
  created_at: string;
};

type RawHrTeamMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  hr_role: string | null;
  is_tenant_owner: boolean | null;
};

function normalizeInviteRow(row: RawPendingTenantInvite): PendingTenantInvite {
  return {
    id: row.id,
    invited_email: row.invited_email,
    invited_hr_role: isHrSubRole(row.invited_hr_role)
      ? row.invited_hr_role
      : "hr_generalist",
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

export async function listPendingHrInvitesAction(): Promise<{
  success: boolean;
  invites: PendingTenantInvite[];
  error?: string;
}> {
  const ctx = await requireHrPermission("settings:manage_roles");
  if (!ctx.tenant_id) {
    return { success: false, invites: [], error: "Workspace tenant not found." };
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("tenant_invites")
    .select("id, invited_email, invited_hr_role, expires_at, created_at")
    .eq("tenant_id", ctx.tenant_id)
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .returns<RawPendingTenantInvite[]>();

  if (error) {
    return { success: false, invites: [], error: error.message };
  }

  return {
    success: true,
    invites: (data ?? []).map(normalizeInviteRow),
  };
}

export async function generateHrInviteAction(
  invitedEmailInput: string,
  invitedHrRoleInput: HrSubRole = "hr_generalist"
): Promise<{
  success: boolean;
  invitePath?: string;
  invite?: PendingTenantInvite;
  error?: string;
}> {
  const ctx = await requireHrPermission("settings:manage_roles");
  if (!ctx.tenant_id) {
    return { success: false, error: "Workspace tenant not found." };
  }

  const invitedEmail = invitedEmailInput.trim().toLowerCase();
  if (!invitedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
    return { success: false, error: "Please enter a valid work email address." };
  }

  if (!isHrSubRole(invitedHrRoleInput)) {
    return { success: false, error: "Please select a valid workspace role." };
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const admin = getAdminClient();

  // Check if a pending invite already exists for (tenant_id, invited_email)
  const { data: existingPending } = await admin
    .from("tenant_invites")
    .select("id")
    .eq("tenant_id", ctx.tenant_id)
    .eq("invited_email", invitedEmail)
    .is("accepted_at", null)
    .maybeSingle<{ id: string }>();

  let savedInvite: PendingTenantInvite | null = null;

  if (existingPending?.id) {
    const { data, error } = await admin
      .from("tenant_invites")
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt,
        invited_by: ctx.id,
        invited_hr_role: invitedHrRoleInput,
      })
      .eq("id", existingPending.id)
      .eq("tenant_id", ctx.tenant_id)
      .select("id, invited_email, invited_hr_role, expires_at, created_at")
      .single<RawPendingTenantInvite>();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to refresh invite link." };
    }
    savedInvite = normalizeInviteRow(data);
  } else {
    const { data, error } = await admin
      .from("tenant_invites")
      .insert({
        tenant_id: ctx.tenant_id,
        invited_email: invitedEmail,
        invited_by: ctx.id,
        invited_hr_role: invitedHrRoleInput,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("id, invited_email, invited_hr_role, expires_at, created_at")
      .single<RawPendingTenantInvite>();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to create invite link." };
    }
    savedInvite = normalizeInviteRow(data);
  }

  revalidatePath("/hr/profile");
  revalidatePath("/hr/settings/branches");

  return {
    success: true,
    invitePath: `/register/hr?invite=${rawToken}`,
    invite: savedInvite,
  };
}

export async function revokeHrInviteAction(inviteId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const ctx = await requireHrPermission("settings:manage_roles");
  if (!ctx.tenant_id) {
    return { success: false, error: "Workspace tenant not found." };
  }

  const trimmedId = inviteId.trim();
  if (!trimmedId) {
    return { success: false, error: "Invite ID is required." };
  }

  const admin = getAdminClient();
  const { error } = await admin
    .from("tenant_invites")
    .delete()
    .eq("id", trimmedId)
    .eq("tenant_id", ctx.tenant_id)
    .is("accepted_at", null);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/hr/profile");
  revalidatePath("/hr/settings/branches");

  return { success: true };
}

export async function listHrTeamMembersAction(): Promise<{
  success: boolean;
  members: HrTeamMember[];
  error?: string;
}> {
  const ctx = await requireHrPermission("settings:view");
  if (!ctx.tenant_id) {
    return { success: false, members: [], error: "Workspace tenant not found." };
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email, hr_role, is_tenant_owner")
    .eq("tenant_id", ctx.tenant_id)
    .eq("role", "hr_manager")
    .order("is_tenant_owner", { ascending: false })
    .order("email", { ascending: true })
    .returns<RawHrTeamMember[]>();

  if (error) {
    return { success: false, members: [], error: error.message };
  }

  const members: HrTeamMember[] = (data ?? []).map((row) => {
    const isOwner = Boolean(row.is_tenant_owner);
    return {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      hr_role: resolveEffectiveHrRole(row.hr_role, isOwner),
      is_tenant_owner: isOwner,
    };
  });

  return {
    success: true,
    members,
  };
}

export async function updateHrMemberRoleAction(
  memberId: string,
  newRole: HrSubRole
): Promise<{
  success: boolean;
  member?: HrTeamMember;
  error?: string;
}> {
  const ctx = await requireHrPermission("settings:manage_roles");
  if (!ctx.tenant_id) {
    return { success: false, error: "Workspace tenant not found." };
  }

  const trimmedId = memberId.trim();
  if (!trimmedId) {
    return { success: false, error: "Team member ID is required." };
  }

  if (!isHrSubRole(newRole)) {
    return { success: false, error: "Invalid HR workspace role." };
  }

  const admin = getAdminClient();
  const { data: target, error: lookupError } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email, hr_role, is_tenant_owner")
    .eq("id", trimmedId)
    .eq("tenant_id", ctx.tenant_id)
    .eq("role", "hr_manager")
    .maybeSingle<RawHrTeamMember>();

  if (lookupError || !target) {
    return { success: false, error: lookupError?.message || "HR team member not found." };
  }

  const targetIsOwner = Boolean(target.is_tenant_owner);
  if (targetIsOwner && newRole !== "hr_admin") {
    return {
      success: false,
      error: "Workspace owners cannot demote themselves or lose HR Admin access.",
    };
  }

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ hr_role: newRole })
    .eq("id", trimmedId)
    .eq("tenant_id", ctx.tenant_id)
    .eq("role", "hr_manager")
    .select("id, first_name, last_name, email, hr_role, is_tenant_owner")
    .single<RawHrTeamMember>();

  if (updateError || !updated) {
    return { success: false, error: updateError?.message || "Failed to update team member role." };
  }

  revalidatePath("/hr/profile");
  revalidatePath("/hr/settings/branches");

  const updatedIsOwner = Boolean(updated.is_tenant_owner);
  return {
    success: true,
    member: {
      id: updated.id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      email: updated.email,
      hr_role: resolveEffectiveHrRole(updated.hr_role, updatedIsOwner),
      is_tenant_owner: updatedIsOwner,
    },
  };
}
