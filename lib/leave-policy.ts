import type { SupabaseClient } from "@supabase/supabase-js";

export type LeavePolicyType = "company_standard" | "statutory_sil" | "custom";
export type LeaveEligibility = "day_1" | "upon_regularization";

export type LedgerLeaveType =
  | "VL"
  | "SL"
  | "SIL"
  | "PATERNITY"
  | "MATERNITY"
  | "SOLO_PARENT"
  | "VAWC"
  | "MAGNA_CARTA";

export type DbLeaveTypeEnum =
  | "vacation"
  | "sick"
  | "sil"
  | "paternity"
  | "maternity"
  | "solo_parent"
  | "vawc"
  | "magna_carta"
  | "emergency"
  | "unpaid"
  | "other";

export interface LeavePolicyConfig {
  leave_policy_type: LeavePolicyType;
  vacation_leave_days: number;
  sick_leave_days: number;
  service_incentive_leave_days: number;
  leave_eligibility: LeaveEligibility;
}

export const DEFAULT_LEAVE_POLICY: LeavePolicyConfig = {
  leave_policy_type: "company_standard",
  vacation_leave_days: 15,
  sick_leave_days: 15,
  service_incentive_leave_days: 0,
  leave_eligibility: "upon_regularization",
};

export const SPECIAL_STATUTORY_LEAVE_TYPES = new Set<string>([
  "MATERNITY",
  "PATERNITY",
  "SOLO_PARENT",
  "VAWC",
  "MAGNA_CARTA",
  "maternity",
  "paternity",
  "solo_parent",
  "vawc",
  "magna_carta",
]);

export const POOL_DEDUCTIBLE_LEDGER_TYPES = new Set<LedgerLeaveType>([
  "VL",
  "SL",
  "SIL",
]);

export function normalizeLeavePolicyType(raw: unknown): LeavePolicyType {
  const val = String(raw ?? "").trim().toLowerCase();
  if (val === "statutory_sil") return "statutory_sil";
  if (val === "custom") return "custom";
  return "company_standard";
}

export function normalizeLeaveEligibility(raw: unknown): LeaveEligibility {
  const val = String(raw ?? "").trim().toLowerCase();
  if (val === "day_1" || val === "day1" || val === "day 1") return "day_1";
  return "upon_regularization";
}

export function clampLeaveDays(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(365, Math.round(n * 100) / 100);
}

export function normalizeLeavePolicyConfig(input: {
  leave_policy_type?: unknown;
  vacation_leave_days?: unknown;
  sick_leave_days?: unknown;
  service_incentive_leave_days?: unknown;
  leave_eligibility?: unknown;
}): LeavePolicyConfig {
  const policyType = normalizeLeavePolicyType(input.leave_policy_type);
  const eligibility = normalizeLeaveEligibility(input.leave_eligibility);

  if (policyType === "statutory_sil") {
    const sil = clampLeaveDays(input.service_incentive_leave_days, 5);
    return {
      leave_policy_type: "statutory_sil",
      vacation_leave_days: 0,
      sick_leave_days: 0,
      service_incentive_leave_days: sil > 0 ? sil : 5,
      leave_eligibility: eligibility,
    };
  }

  if (policyType === "custom") {
    return {
      leave_policy_type: "custom",
      vacation_leave_days: clampLeaveDays(input.vacation_leave_days, 15),
      sick_leave_days: clampLeaveDays(input.sick_leave_days, 15),
      service_incentive_leave_days: clampLeaveDays(
        input.service_incentive_leave_days,
        0
      ),
      leave_eligibility: eligibility,
    };
  }

  // company_standard
  return {
    leave_policy_type: "company_standard",
    vacation_leave_days: clampLeaveDays(input.vacation_leave_days, 15),
    sick_leave_days: clampLeaveDays(input.sick_leave_days, 15),
    service_incentive_leave_days: clampLeaveDays(
      input.service_incentive_leave_days,
      0
    ),
    leave_eligibility: eligibility,
  };
}

/**
 * Resolves a structured LeavePolicyConfig from structured DB columns first,
 * falling back to legacy offer_letter_settings / job_metadata keys when needed.
 */
export function resolveLeavePolicyFromSources(
  primary?: Record<string, unknown> | null,
  fallback?: Record<string, unknown> | null
): LeavePolicyConfig {
  const p = primary ?? {};
  const f = fallback ?? {};

  const hasStructuredPolicy =
    typeof p.leave_policy_type === "string" ||
    p.vacation_leave_days != null ||
    p.sick_leave_days != null ||
    p.service_incentive_leave_days != null;

  if (hasStructuredPolicy) {
    return normalizeLeavePolicyConfig({
      leave_policy_type: p.leave_policy_type ?? f.leave_policy_type,
      vacation_leave_days:
        p.vacation_leave_days ??
        f.vacation_leave_days ??
        f.phVacationLeaveDays,
      sick_leave_days:
        p.sick_leave_days ?? f.sick_leave_days ?? f.phSickLeaveDays,
      service_incentive_leave_days:
        p.service_incentive_leave_days ??
        f.service_incentive_leave_days ??
        f.service_incentive_leave ??
        f.phServiceIncentiveLeave,
      leave_eligibility: p.leave_eligibility ?? f.leave_eligibility,
    });
  }

  const rawVl = Number(
    f.vacation_leave_days ?? f.phVacationLeaveDays ?? NaN
  );
  const rawSl = Number(f.sick_leave_days ?? f.phSickLeaveDays ?? NaN);
  const rawSil = Number(
    f.service_incentive_leave_days ??
      f.service_incentive_leave ??
      f.phServiceIncentiveLeave ??
      NaN
  );

  if (
    typeof f.leave_policy_type === "string" &&
    ["company_standard", "statutory_sil", "custom"].includes(
      f.leave_policy_type
    )
  ) {
    return normalizeLeavePolicyConfig({
      leave_policy_type: f.leave_policy_type,
      vacation_leave_days: Number.isFinite(rawVl) ? rawVl : 15,
      sick_leave_days: Number.isFinite(rawSl) ? rawSl : 15,
      service_incentive_leave_days: Number.isFinite(rawSil) ? rawSil : 0,
      leave_eligibility: f.leave_eligibility,
    });
  }

  if (
    Number.isFinite(rawSil) &&
    rawSil > 0 &&
    (!Number.isFinite(rawVl) || rawVl === 0) &&
    (!Number.isFinite(rawSl) || rawSl === 0)
  ) {
    return normalizeLeavePolicyConfig({
      leave_policy_type: "statutory_sil",
      vacation_leave_days: 0,
      sick_leave_days: 0,
      service_incentive_leave_days: rawSil,
      leave_eligibility: f.leave_eligibility,
    });
  }

  if (Number.isFinite(rawVl) || Number.isFinite(rawSl)) {
    const vl = Number.isFinite(rawVl) ? rawVl : 0;
    const sl = Number.isFinite(rawSl) ? rawSl : 0;
    const sil = Number.isFinite(rawSil) ? rawSil : 0;
    const isStandard = vl === 15 && sl === 15 && sil === 0;
    return normalizeLeavePolicyConfig({
      leave_policy_type: isStandard ? "company_standard" : "custom",
      vacation_leave_days: vl,
      sick_leave_days: sl,
      service_incentive_leave_days: sil,
      leave_eligibility: f.leave_eligibility,
    });
  }

  return { ...DEFAULT_LEAVE_POLICY };
}

export function formatLeaveEligibilityLabel(
  eligibility: LeaveEligibility | string | null | undefined
): string {
  return normalizeLeaveEligibility(eligibility) === "day_1"
    ? "Effective Day 1"
    : "Upon Regularization";
}

/**
 * Formats leave credits string for Offer Terms, Compensation Breakdown, and DocuSeal `leave_credits`.
 * Examples:
 *  - "12 Vacation Leave + 12 Sick Leave / year (Upon Regularization)"
 *  - "5 Service Incentive Leave (SIL) / year (after 1 year of continuous service)"
 */
export function formatLeaveCreditsDisplay(config: LeavePolicyConfig): string {
  const eligLabel = formatLeaveEligibilityLabel(config.leave_eligibility);

  if (
    config.leave_policy_type === "statutory_sil" ||
    (config.vacation_leave_days <= 0 &&
      config.sick_leave_days <= 0 &&
      config.service_incentive_leave_days > 0)
  ) {
    const sil = config.service_incentive_leave_days || 5;
    return `${sil} Service Incentive Leave (SIL) / year (after 1 year of continuous service)`;
  }

  const parts: string[] = [];
  if (config.vacation_leave_days > 0) {
    parts.push(`${config.vacation_leave_days} Vacation Leave`);
  }
  if (config.sick_leave_days > 0) {
    parts.push(`${config.sick_leave_days} Sick Leave`);
  }
  if (config.service_incentive_leave_days > 0) {
    parts.push(`${config.service_incentive_leave_days} SIL`);
  }

  if (parts.length === 0) {
    return "5 Service Incentive Leave (SIL) / year (Labor Code Art. 95)";
  }

  return `${parts.join(" + ")} / year (${eligLabel})`;
}

/**
 * Maps any leave type input (uppercase ledger code or lowercase enum) to the
 * canonical PostgreSQL `public.leave_type` enum value used in `leave_requests.leave_type`.
 */
export function toDbLeaveTypeEnum(rawType: string): DbLeaveTypeEnum {
  const v = rawType.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (v) {
    case "vl":
    case "vacation":
    case "vacation_leave":
      return "vacation";
    case "sl":
    case "sick":
    case "sick_leave":
      return "sick";
    case "sil":
    case "service_incentive_leave":
      return "sil";
    case "maternity":
    case "maternity_leave":
      return "maternity";
    case "paternity":
    case "paternity_leave":
      return "paternity";
    case "solo_parent":
    case "solo_parent_leave":
      return "solo_parent";
    case "vawc":
    case "vawc_leave":
      return "vawc";
    case "magna_carta":
    case "magna_carta_leave":
      return "magna_carta";
    case "emergency":
    case "emergency_leave":
      return "emergency";
    case "unpaid":
    case "unpaid_leave":
      return "unpaid";
    default:
      return "other";
  }
}

/**
 * Maps form/UI/DB leave_type values to canonical ledger leave_type codes (`VL`, `SL`, `SIL`, etc.).
 */
export function mapToLedgerLeaveType(rawType: string): LedgerLeaveType | null {
  const v = rawType.trim().toUpperCase().replace(/[\s-]+/g, "_");
  switch (v) {
    case "VL":
    case "VACATION":
    case "VACATION_LEAVE":
      return "VL";
    case "SL":
    case "SICK":
    case "SICK_LEAVE":
      return "SL";
    case "SIL":
    case "SERVICE_INCENTIVE_LEAVE":
      return "SIL";
    case "MATERNITY":
    case "MATERNITY_LEAVE":
      return "MATERNITY";
    case "PATERNITY":
    case "PATERNITY_LEAVE":
      return "PATERNITY";
    case "SOLO_PARENT":
    case "SOLO_PARENT_LEAVE":
      return "SOLO_PARENT";
    case "VAWC":
    case "VAWC_LEAVE":
      return "VAWC";
    case "MAGNA_CARTA":
    case "MAGNA_CARTA_LEAVE":
      return "MAGNA_CARTA";
    default:
      return null;
  }
}

/**
 * Canonical alias for `mapToLedgerLeaveType` used by leave ledger queries & balance updates.
 */
export function toLedgerLeaveCode(rawType: string): LedgerLeaveType | null {
  return mapToLedgerLeaveType(rawType);
}

/**
 * Formats any leave type (enum or ledger code) into a clean human-readable label.
 */
export function formatLeaveTypeDisplayLabel(rawType: string): string {
  const dbType = toDbLeaveTypeEnum(rawType);
  switch (dbType) {
    case "vacation":
      return "Vacation Leave (VL)";
    case "sick":
      return "Sick Leave (SL)";
    case "sil":
      return "Service Incentive Leave (SIL)";
    case "maternity":
      return "Maternity Leave";
    case "paternity":
      return "Paternity Leave";
    case "solo_parent":
      return "Solo Parent Leave";
    case "vawc":
      return "VAWC Leave";
    case "magna_carta":
      return "Magna Carta Leave";
    case "emergency":
      return "Emergency Leave";
    case "unpaid":
      return "Unpaid Leave";
    default:
      return rawType.replace(/_/g, " ");
  }
}

export function isSpecialStatutoryLeave(rawType: string): boolean {
  const mapped = mapToLedgerLeaveType(rawType);
  if (mapped && !POOL_DEDUCTIBLE_LEDGER_TYPES.has(mapped)) {
    return true;
  }
  return SPECIAL_STATUTORY_LEAVE_TYPES.has(rawType.trim().toLowerCase());
}

/**
 * Upserts annual leave ledger rows into `employee_leave_balances` on Confirm Hire / Promote.
 * Idempotent: uses ON CONFLICT (employee_id, year, leave_type).
 */
export async function provisionEmployeeLeaveBalances(params: {
  admin: SupabaseClient;
  tenantId: string;
  employeeId: string;
  policy: LeavePolicyConfig;
  year?: number;
}): Promise<{ provisioned: number; error?: string }> {
  const { admin, tenantId, employeeId, policy } = params;
  const targetYear = params.year ?? new Date().getFullYear();
  const nowIso = new Date().toISOString();

  const rows: Array<{
    tenant_id: string;
    employee_id: string;
    year: number;
    leave_type: LedgerLeaveType;
    entitled_days: number;
    eligibility: LeaveEligibility;
    is_active: boolean;
    updated_at: string;
  }> = [];

  if (policy.leave_policy_type === "statutory_sil") {
    rows.push({
      tenant_id: tenantId,
      employee_id: employeeId,
      year: targetYear,
      leave_type: "SIL",
      entitled_days: policy.service_incentive_leave_days > 0 ? policy.service_incentive_leave_days : 5,
      eligibility: policy.leave_eligibility,
      is_active: true,
      updated_at: nowIso,
    });
  } else {
    if (policy.vacation_leave_days > 0) {
      rows.push({
        tenant_id: tenantId,
        employee_id: employeeId,
        year: targetYear,
        leave_type: "VL",
        entitled_days: policy.vacation_leave_days,
        eligibility: policy.leave_eligibility,
        is_active: true,
        updated_at: nowIso,
      });
    }
    if (policy.sick_leave_days > 0) {
      rows.push({
        tenant_id: tenantId,
        employee_id: employeeId,
        year: targetYear,
        leave_type: "SL",
        entitled_days: policy.sick_leave_days,
        eligibility: policy.leave_eligibility,
        is_active: true,
        updated_at: nowIso,
      });
    }
    if (policy.service_incentive_leave_days > 0) {
      rows.push({
        tenant_id: tenantId,
        employee_id: employeeId,
        year: targetYear,
        leave_type: "SIL",
        entitled_days: policy.service_incentive_leave_days,
        eligibility: policy.leave_eligibility,
        is_active: true,
        updated_at: nowIso,
      });
    }
  }

  if (rows.length === 0) {
    return { provisioned: 0 };
  }

  const { error } = await admin
    .from("employee_leave_balances")
    .upsert(rows, { onConflict: "employee_id,year,leave_type" });

  if (error) {
    console.warn("[provisionEmployeeLeaveBalances] upsert warning:", error.message);
    return { provisioned: 0, error: error.message };
  }

  return { provisioned: rows.length };
}
