"use server";

import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { isHrSubRole, type HrSubRole } from "@/lib/rbac/permissions";
import { isSubscriptionPlan, type SubscriptionPlan } from "@/lib/subscription-tiers";

export type HrInviteValidationResult =
  | {
      valid: true;
      inviteId: string;
      tenantId: string;
      tenantName: string;
      invitedEmail: string;
      invitedHrRole: HrSubRole;
      expiresAt: string;
    }
  | {
      valid: false;
      error: string;
    };

export type HrOnboardingActionResult = {
  success: boolean;
  error?: string;
  tenantId?: string;
  tenantName?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

const EXPIRED_INVITE_MESSAGE =
  "This invite link has expired. Ask your HR Manager for a new link.";

export async function hashInviteToken(rawToken: string): Promise<string> {
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
}

function mapAuthCreateUserError(message: string | undefined): string {
  const normalized = (message ?? "").trim().toLowerCase();
  if (
    normalized.includes("already been registered") ||
    normalized.includes("already registered") ||
    normalized.includes("user already exists") ||
    normalized.includes("duplicate")
  ) {
    return "An account with this email already exists. Please sign in instead.";
  }
  return message || "Unable to create HR account.";
}

export async function validateHrInviteToken(
  rawToken: string | null | undefined
): Promise<HrInviteValidationResult> {
  const trimmed = (rawToken ?? "").trim();
  if (!trimmed) {
    return { valid: false, error: EXPIRED_INVITE_MESSAGE };
  }

  const tokenHash = await hashInviteToken(trimmed);
  const admin = getAdminClient();

  const { data: invite, error } = await admin
    .from("tenant_invites")
    .select("id, tenant_id, invited_email, invited_hr_role, expires_at, accepted_at, tenants(name)")
    .eq("token_hash", tokenHash)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<{
      id: string;
      tenant_id: string;
      invited_email: string;
      invited_hr_role: string | null;
      expires_at: string;
      accepted_at: string | null;
      tenants?: { name?: string | null } | Array<{ name?: string | null }> | null;
    }>();

  if (error || !invite) {
    return { valid: false, error: EXPIRED_INVITE_MESSAGE };
  }

  const tenantObj = Array.isArray(invite.tenants) ? invite.tenants[0] : invite.tenants;
  let tenantName = tenantObj?.name?.trim() || "";

  if (!tenantName) {
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("name")
      .eq("id", invite.tenant_id)
      .maybeSingle<{ name?: string | null }>();
    tenantName = tenantRow?.name?.trim() || "Company";
  }

  const invitedHrRole: HrSubRole = isHrSubRole(invite.invited_hr_role)
    ? invite.invited_hr_role
    : "hr_generalist";

  return {
    valid: true,
    inviteId: invite.id,
    tenantId: invite.tenant_id,
    tenantName,
    invitedEmail: invite.invited_email.trim().toLowerCase(),
    invitedHrRole,
    expiresAt: invite.expires_at,
  };
}

export async function registerHrWorkspaceAtomic(input: {
  companyName: string;
  industry?: string | null;
  companySize?: string | null;
  address?: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email: string;
  password: string;
  plan?: string | null;
  logoUrl?: string | null;
}): Promise<HrOnboardingActionResult> {
  const companyName = input.companyName.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const phone = (input.phone ?? "").trim();
  const industry = (input.industry ?? "").trim() || null;
  const companySize = (input.companySize ?? "").trim() || null;
  const address = (input.address ?? "").trim() || null;
  const plan: SubscriptionPlan = isSubscriptionPlan(input.plan ?? null)
    ? (input.plan as SubscriptionPlan)
    : "starter";

  if (!companyName) {
    return { success: false, error: "Company name is required." };
  }
  if (!firstName || !lastName) {
    return { success: false, error: "First name and last name are required." };
  }
  if (!email) {
    return { success: false, error: "Work email is required." };
  }
  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const admin = getAdminClient();
  let createdUserId: string | null = null;

  try {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `${firstName} ${lastName}`.trim(),
        first_name: firstName,
        last_name: lastName,
        phone,
        role: "hr_manager",
        company_name: companyName,
        tenant_name: companyName,
        industry,
        company_size: companySize,
        address,
        plan,
      },
    });

    if (authError || !authData?.user) {
      return {
        success: false,
        error: mapAuthCreateUserError(authError?.message),
      };
    }

    createdUserId = authData.user.id;

    const { data: tenantId, error: rpcError } = await admin.rpc("create_tenant_for_hr", {
      p_user_id: createdUserId,
      p_email: email,
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone: phone || null,
      p_company_name: companyName,
      p_industry: industry,
      p_company_size: companySize,
      p_address: address,
      p_plan: plan,
      p_logo_url: input.logoUrl ?? null,
    });

    if (rpcError || !tenantId) {
      throw new Error(rpcError?.message || "Failed to initialize company workspace.");
    }

    return {
      success: true,
      tenantId: String(tenantId),
      tenantName: companyName,
      email,
      firstName,
      lastName,
    };
  } catch (err) {
    if (createdUserId) {
      try {
        await admin.auth.admin.deleteUser(createdUserId);
      } catch (cleanupErr) {
        console.error("[registerHrWorkspaceAtomic] rollback deleteUser failed:", cleanupErr);
      }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to complete HR workspace registration.",
    };
  }
}

export async function acceptHrInviteAtomic(input: {
  inviteToken: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  password: string;
}): Promise<HrOnboardingActionResult> {
  const rawToken = input.inviteToken.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = (input.phone ?? "").trim();
  const password = input.password;

  if (!rawToken) {
    return { success: false, error: EXPIRED_INVITE_MESSAGE };
  }
  if (!firstName || !lastName) {
    return { success: false, error: "First name and last name are required." };
  }
  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const validation = await validateHrInviteToken(rawToken);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const tokenHash = await hashInviteToken(rawToken);
  const admin = getAdminClient();
  let createdUserId: string | null = null;

  try {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: validation.invitedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `${firstName} ${lastName}`.trim(),
        first_name: firstName,
        last_name: lastName,
        phone,
        role: "hr_manager",
        tenant_id: validation.tenantId,
        company_name: validation.tenantName,
        tenant_name: validation.tenantName,
      },
    });

    if (authError || !authData?.user) {
      return {
        success: false,
        error: mapAuthCreateUserError(authError?.message),
      };
    }

    createdUserId = authData.user.id;

    const { data: tenantId, error: rpcError } = await admin.rpc("accept_hr_invite", {
      p_user_id: createdUserId,
      p_token_hash: tokenHash,
      p_email: validation.invitedEmail,
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone: phone || null,
    });

    if (rpcError || !tenantId) {
      throw new Error(rpcError?.message || EXPIRED_INVITE_MESSAGE);
    }

    return {
      success: true,
      tenantId: String(tenantId),
      tenantName: validation.tenantName,
      email: validation.invitedEmail,
      firstName,
      lastName,
    };
  } catch (err) {
    if (createdUserId) {
      try {
        await admin.auth.admin.deleteUser(createdUserId);
      } catch (cleanupErr) {
        console.error("[acceptHrInviteAtomic] rollback deleteUser failed:", cleanupErr);
      }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : EXPIRED_INVITE_MESSAGE,
    };
  }
}
