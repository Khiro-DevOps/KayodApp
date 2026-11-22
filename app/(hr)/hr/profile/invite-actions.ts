"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isHRRole } from "@/lib/roles";

export type PendingTenantInvite = {
  id: string;
  invited_email: string;
  expires_at: string;
  created_at: string;
};

async function verifyTenantOwnerSession(): Promise<
  | {
      ok: true;
      userId: string;
      tenantId: string;
    }
  | {
      ok: false;
      error: string;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized." };
  }

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, tenant_id, is_tenant_owner")
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      role?: string | null;
      tenant_id?: string | null;
      is_tenant_owner?: boolean | null;
    }>();

  if (!profile || !isHRRole(profile.role) || !profile.tenant_id || !profile.is_tenant_owner) {
    return {
      ok: false,
      error: "Only the workspace owner HR Manager can manage HR invites.",
    };
  }

  return {
    ok: true,
    userId: user.id,
    tenantId: profile.tenant_id,
  };
}

export async function listPendingHrInvitesAction(): Promise<{
  success: boolean;
  invites: PendingTenantInvite[];
  error?: string;
}> {
  const auth = await verifyTenantOwnerSession();
  if (!auth.ok) {
    return { success: false, invites: [], error: auth.error };
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("tenant_invites")
    .select("id, invited_email, expires_at, created_at")
    .eq("tenant_id", auth.tenantId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .returns<PendingTenantInvite[]>();

  if (error) {
    return { success: false, invites: [], error: error.message };
  }

  return {
    success: true,
    invites: data ?? [],
  };
}

export async function generateHrInviteAction(invitedEmailInput: string): Promise<{
  success: boolean;
  invitePath?: string;
  invite?: PendingTenantInvite;
  error?: string;
}> {
  const auth = await verifyTenantOwnerSession();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const invitedEmail = invitedEmailInput.trim().toLowerCase();
  if (!invitedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
    return { success: false, error: "Please enter a valid work email address." };
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const admin = getAdminClient();

  // Check if a pending invite already exists for (tenant_id, invited_email)
  const { data: existingPending } = await admin
    .from("tenant_invites")
    .select("id")
    .eq("tenant_id", auth.tenantId)
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
        invited_by: auth.userId,
      })
      .eq("id", existingPending.id)
      .eq("tenant_id", auth.tenantId)
      .select("id, invited_email, expires_at, created_at")
      .single<PendingTenantInvite>();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to refresh invite link." };
    }
    savedInvite = data;
  } else {
    const { data, error } = await admin
      .from("tenant_invites")
      .insert({
        tenant_id: auth.tenantId,
        invited_email: invitedEmail,
        invited_by: auth.userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("id, invited_email, expires_at, created_at")
      .single<PendingTenantInvite>();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to create invite link." };
    }
    savedInvite = data;
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
  const auth = await verifyTenantOwnerSession();
  if (!auth.ok) {
    return { success: false, error: auth.error };
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
    .eq("tenant_id", auth.tenantId)
    .is("accepted_at", null);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/hr/profile");
  revalidatePath("/hr/settings/branches");

  return { success: true };
}
