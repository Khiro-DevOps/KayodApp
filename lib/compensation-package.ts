export type HmoTiming = "day_1" | "upon_regularization";

export interface CustomCompensationItem {
  id: string;
  label: string;
  amount: number;
  kind: "allowance" | "incentive";
  enabled: boolean;
}

export interface PhilippineCompensationPackage {
  rice_allowance: { enabled: boolean; amount: number };
  transport_allowance: { enabled: boolean; amount: number };
  internet_allowance: { enabled: boolean; amount: number };
  meal_allowance: { enabled: boolean; amount: number };
  clothing_allowance: { enabled: boolean; amount: number };
  attendance_incentive: { enabled: boolean; amount: number };
  performance_bonus: { enabled: boolean; amount: number };
  thirteenth_month_pay: boolean;
  hmo_coverage: { enabled: boolean; timing: HmoTiming };
  custom_items: CustomCompensationItem[];
}

export function createDefaultCompensationPackage(): PhilippineCompensationPackage {
  return {
    rice_allowance: { enabled: false, amount: 2000 },
    transport_allowance: { enabled: false, amount: 1500 },
    internet_allowance: { enabled: false, amount: 1500 },
    meal_allowance: { enabled: false, amount: 1000 },
    clothing_allowance: { enabled: false, amount: 500 },
    attendance_incentive: { enabled: false, amount: 2000 },
    performance_bonus: { enabled: false, amount: 3000 },
    thirteenth_month_pay: true,
    hmo_coverage: { enabled: false, timing: "upon_regularization" },
    custom_items: [],
  };
}

function toSafeAmount(val: unknown, fallback: number): number {
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function parseToggleAmount(
  raw: unknown,
  defaultAmount: number,
  legacyAmount?: unknown
): { enabled: boolean; amount: number } {
  if (raw && typeof raw === "object") {
    const obj = raw as { enabled?: unknown; amount?: unknown };
    return {
      enabled: Boolean(obj.enabled),
      amount: toSafeAmount(obj.amount, defaultAmount),
    };
  }
  const legacy = Number(legacyAmount);
  if (Number.isFinite(legacy) && legacy > 0) {
    return { enabled: true, amount: legacy };
  }
  return { enabled: false, amount: defaultAmount };
}

export function parseCompensationPackage(
  raw: unknown,
  legacySettings?: Record<string, unknown> | null
): PhilippineCompensationPackage {
  const defaults = createDefaultCompensationPackage();
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const legacy = legacySettings ?? {};

  const hmoRaw =
    source.hmo_coverage && typeof source.hmo_coverage === "object"
      ? (source.hmo_coverage as Record<string, unknown>)
      : null;

  const customRaw = Array.isArray(source.custom_items) ? source.custom_items : [];
  const custom_items: CustomCompensationItem[] = customRaw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, idx) => ({
      id: typeof item.id === "string" && item.id ? item.id : `custom-${idx}`,
      label: typeof item.label === "string" ? item.label : "Custom Benefit",
      amount: toSafeAmount(item.amount, 0),
      kind: item.kind === "incentive" ? "incentive" : "allowance",
      enabled: item.enabled !== false,
    }));

  return {
    rice_allowance: parseToggleAmount(source.rice_allowance, defaults.rice_allowance.amount),
    transport_allowance: parseToggleAmount(
      source.transport_allowance,
      defaults.transport_allowance.amount,
      legacy.phTransportAllowance
    ),
    internet_allowance: parseToggleAmount(
      source.internet_allowance,
      defaults.internet_allowance.amount,
      legacy.phInternetAllowance
    ),
    meal_allowance: parseToggleAmount(
      source.meal_allowance,
      defaults.meal_allowance.amount,
      legacy.phMealAllowance
    ),
    clothing_allowance: parseToggleAmount(
      source.clothing_allowance,
      defaults.clothing_allowance.amount
    ),
    attendance_incentive: parseToggleAmount(
      source.attendance_incentive,
      defaults.attendance_incentive.amount,
      legacy.attendance_incentive ?? legacy.phAttendanceIncentive
    ),
    performance_bonus: parseToggleAmount(
      source.performance_bonus,
      defaults.performance_bonus.amount
    ),
    thirteenth_month_pay:
      source.thirteenth_month_pay !== undefined
        ? Boolean(source.thirteenth_month_pay)
        : legacy.phMandatory13thMonth !== undefined
          ? Boolean(legacy.phMandatory13thMonth)
          : true,
    hmo_coverage: {
      enabled: hmoRaw ? Boolean(hmoRaw.enabled) : Boolean(legacy.phHmoProvider),
      timing: hmoRaw?.timing === "day_1" ? "day_1" : "upon_regularization",
    },
    custom_items,
  };
}

export interface ItemizedCompEntry {
  key: string;
  label: string;
  amount: number;
}

export interface CompensationTotals {
  monthlyAllowancesTotal: number;
  monthlyIncentivesTotal: number;
  attendanceIncentiveAmount: number;
  performanceBonusAmount: number;
  totalMonthlyPackage: number;
  itemizedAllowances: ItemizedCompEntry[];
  itemizedIncentives: ItemizedCompEntry[];
  selectedBenefitLabels: string[];
}

export function computeCompensationTotals(
  pkg: PhilippineCompensationPackage,
  baseSalary = 0
): CompensationTotals {
  const itemizedAllowances: ItemizedCompEntry[] = [];
  const itemizedIncentives: ItemizedCompEntry[] = [];
  const selectedBenefitLabels: string[] = [];

  const allowanceDefs: Array<{ key: keyof PhilippineCompensationPackage; label: string }> = [
    { key: "rice_allowance", label: "Rice Subsidy" },
    { key: "transport_allowance", label: "Transportation / Fuel Allowance" },
    { key: "internet_allowance", label: "Communication / Internet Allowance" },
    { key: "meal_allowance", label: "Meal Allowance" },
    { key: "clothing_allowance", label: "Clothing / Uniform Allowance" },
  ];

  for (const def of allowanceDefs) {
    const entry = pkg[def.key] as { enabled: boolean; amount: number };
    if (entry?.enabled && entry.amount > 0) {
      itemizedAllowances.push({ key: String(def.key), label: def.label, amount: entry.amount });
      selectedBenefitLabels.push(`${def.label} (₱${entry.amount.toLocaleString("en-PH")}/mo)`);
    }
  }

  if (pkg.attendance_incentive.enabled && pkg.attendance_incentive.amount > 0) {
    itemizedIncentives.push({
      key: "attendance_incentive",
      label: "Perfect Attendance Incentive",
      amount: pkg.attendance_incentive.amount,
    });
    selectedBenefitLabels.push(
      `Perfect Attendance Incentive (₱${pkg.attendance_incentive.amount.toLocaleString("en-PH")}/mo)`
    );
  }

  if (pkg.performance_bonus.enabled && pkg.performance_bonus.amount > 0) {
    itemizedIncentives.push({
      key: "performance_bonus",
      label: "Performance / KPI Bonus",
      amount: pkg.performance_bonus.amount,
    });
    selectedBenefitLabels.push(
      `Performance / KPI Bonus (₱${pkg.performance_bonus.amount.toLocaleString("en-PH")}/mo)`
    );
  }

  for (const custom of pkg.custom_items) {
    if (!custom.enabled || custom.amount <= 0 || !custom.label.trim()) continue;
    if (custom.kind === "incentive") {
      itemizedIncentives.push({ key: custom.id, label: custom.label.trim(), amount: custom.amount });
    } else {
      itemizedAllowances.push({ key: custom.id, label: custom.label.trim(), amount: custom.amount });
    }
    selectedBenefitLabels.push(`${custom.label.trim()} (₱${custom.amount.toLocaleString("en-PH")}/mo)`);
  }

  if (pkg.thirteenth_month_pay) {
    selectedBenefitLabels.push("13th-Month Pay (PD 851)");
  }
  if (pkg.hmo_coverage.enabled) {
    selectedBenefitLabels.push(
      pkg.hmo_coverage.timing === "day_1"
        ? "HMO / Medical Coverage (Day 1)"
        : "HMO / Medical Coverage (Upon Regularization)"
    );
  }

  const monthlyAllowancesTotal = itemizedAllowances.reduce((sum, item) => sum + item.amount, 0);
  const monthlyIncentivesTotal = itemizedIncentives.reduce((sum, item) => sum + item.amount, 0);
  const safeBase = Number.isFinite(baseSalary) && baseSalary > 0 ? baseSalary : 0;

  return {
    monthlyAllowancesTotal,
    monthlyIncentivesTotal,
    attendanceIncentiveAmount: pkg.attendance_incentive.enabled ? pkg.attendance_incentive.amount : 0,
    performanceBonusAmount: pkg.performance_bonus.enabled ? pkg.performance_bonus.amount : 0,
    totalMonthlyPackage: safeBase + monthlyAllowancesTotal + monthlyIncentivesTotal,
    itemizedAllowances,
    itemizedIncentives,
    selectedBenefitLabels,
  };
}

export function formatPhp(amount: number, currency = "PHP"): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompensationSummaryText(
  pkg: PhilippineCompensationPackage,
  baseSalary: number,
  currency = "PHP"
): string {
  const totals = computeCompensationTotals(pkg, baseSalary);
  const lines: string[] = [`Monthly Basic Salary: ${formatPhp(baseSalary, currency)}`];

  if (totals.itemizedAllowances.length > 0) {
    lines.push("Monthly Allowances:");
    for (const a of totals.itemizedAllowances) {
      lines.push(`  • ${a.label}: ${formatPhp(a.amount, currency)}/mo`);
    }
  }
  if (totals.itemizedIncentives.length > 0) {
    lines.push("Incentives & Bonuses:");
    for (const i of totals.itemizedIncentives) {
      lines.push(`  • ${i.label}: ${formatPhp(i.amount, currency)}/mo`);
    }
  }
  if (pkg.thirteenth_month_pay) {
    lines.push("Statutory: 13th-Month Pay (PD 851), SSS, PhilHealth & Pag-IBIG");
  }
  if (pkg.hmo_coverage.enabled) {
    lines.push(
      `Medical: HMO Coverage (${pkg.hmo_coverage.timing === "day_1" ? "Effective Day 1" : "Upon Regularization"})`
    );
  }
  lines.push(`Total Monthly Package (incl. incentives): ${formatPhp(totals.totalMonthlyPackage, currency)}`);
  return lines.join("\n");
}
