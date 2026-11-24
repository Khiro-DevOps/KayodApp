import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { effectiveRole, isHRRole } from "@/lib/roles";
import {
  canHr,
  getDefaultHrLandingPath,
  resolveEffectiveHrRole,
  type HrSubRole,
  type Permission,
} from "./permissions";

export type HrSessionContext = {
  id: string;
  role: string;
  hr_role: HrSubRole;
  raw_hr_role: string | null;
  tenant_id: string | null;
  is_tenant_owner: boolean;
};

type ProfileRbacRow = {
  id: string;
  role: string | null;
  hr_role: string | null;
  tenant_id: string | null;
  is_tenant_owner: boolean | null;
};

/**
 * Fetches the authenticated HR user's RBAC profile context.
 * Returns `null` if the user is unauthenticated, has no profile, or does not hold an HR role.
 */
export async function getHrSessionContext(): Promise<HrSessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const rawMetadata = (
    (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}
  ) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, hr_role, tenant_id, is_tenant_owner")
    .eq("id", user.id)
    .maybeSingle<ProfileRbacRow>();

  if (!profile) {
    return null;
  }

  const resolvedRole = effectiveRole(profile.role, authRole);
  if (!isHRRole(resolvedRole)) {
    return null;
  }

  const isTenantOwner = Boolean(profile.is_tenant_owner);

  return {
    id: profile.id,
    role: resolvedRole,
    hr_role: resolveEffectiveHrRole(profile.hr_role, isTenantOwner),
    raw_hr_role: profile.hr_role ?? null,
    tenant_id: profile.tenant_id ?? null,
    is_tenant_owner: isTenantOwner,
  };
}

/**
 * Guards an HR server component or server action by permission.
 * - Unauthenticated or non-HR users are redirected to `/login`.
 * - HR users lacking `permission` are redirected to their role's default landing path.
 */
export async function requireHrPermission(
  permission: Permission
): Promise<HrSessionContext> {
  const context = await getHrSessionContext();
  if (!context) {
    redirect("/login");
  }

  if (!canHr(context.hr_role, permission, context.is_tenant_owner)) {
    redirect(getDefaultHrLandingPath(context.hr_role, context.is_tenant_owner));
  }

  return context;
}
