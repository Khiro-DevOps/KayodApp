import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

export type HrJobScope = {
  userId: string;
  tenantId: string | null;
  filter: string;
};

export type TenantTeamNameEntry = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
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
    ? `tenant_id.eq.${tenantId}`
    : `created_by.eq.${userId}`;

  return { userId, tenantId, filter };
}

export async function getTenantTeamNamesMap(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<Record<string, TenantTeamNameEntry>> {
  const map: Record<string, TenantTeamNameEntry> = {};
  if (!tenantId) {
    return map;
  }

  const { data: viewRows, error: viewError } = await supabase
    .from("tenant_team_names")
    .select("id, first_name, last_name");

  let rows: Array<{ id: string; first_name?: string | null; last_name?: string | null }> =
    viewRows ?? [];

  if (viewError || rows.length === 0) {
    const admin = getAdminClient();
    const { data: fallbackRows } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("tenant_id", tenantId);
    rows = fallbackRows ?? [];
  }

  for (const row of rows) {
    if (!row?.id) continue;
    const first = (row.first_name ?? "").trim();
    const last = (row.last_name ?? "").trim();
    const full = [first, last].filter(Boolean).join(" ").trim() || "HR Team";
    map[row.id] = {
      id: row.id,
      firstName: first || full,
      lastName: last,
      fullName: full,
    };
  }

  return map;
}

export function resolveOwnerName(
  teamMap: Record<string, TenantTeamNameEntry>,
  createdBy: string | null | undefined,
  mode: "full" | "first" = "full",
): string {
  if (!createdBy) return "HR Team";
  const entry = teamMap[createdBy];
  if (!entry) return "HR Team";
  return mode === "first" ? entry.firstName : entry.fullName;
}
