export type HrJobScope = {
  userId: string;
  tenantId: string | null;
  filter: string;
};

export async function getHrJobScope(
  supabase: SupabaseClient,
  userId: string,
): Promise<HrJobScope> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle<{ tenant_id?: string | null }>();

  const tenantId = profile?.tenant_id?.trim() || null;
  const filter = tenantId
    ? `tenant_id.eq.${tenantId},created_by.eq.${userId}`
    : `created_by.eq.${userId}`;

  return { userId, tenantId, filter };
}
import type { SupabaseClient } from "@supabase/supabase-js";
