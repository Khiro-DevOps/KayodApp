import {
  computeUnexcusedAbsences,
  type ApprovedLeaveLike,
} from "@/lib/attendance-absent";
import {
  computeNsdMinutes,
  computeOvertimeWindowMinutes,
  parseTimeHm,
  resolveShiftWindowForClockIn,
} from "@/lib/shift-calculations";

export interface PayrollAttendanceLog {
  date?: string | null;
  clock_in?: string | null;
  clock_out?: string | null;
  late_minutes?: number | null;
  undertime_minutes?: number | null;
  night_diff_minutes?: number | null;
  is_rest_day_work?: boolean | null;
  overbreak_minutes?: number | null;
  total_lunch_minutes?: number | null;
  total_break_minutes?: number | null;
}

export interface PayrollApprovedOvertime {
  work_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  overtime_type?: string | null;
}

export interface ContractCompItem {
  label: string;
  amount: number;
  type?: "attendance" | "performance" | "custom";
}

export interface ComputeEmployeeDemoPayslipInput {
  monthlyBaseSalary: number;
  payFrequency?: string | null;
  periodStart: string;
  periodEnd: string;
  startDate?: string | null;
  hireDate?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  workDays?: string[] | null;
  attendanceLogs: PayrollAttendanceLog[];
  approvedLeaves: ApprovedLeaveLike[];
  approvedOvertimes?: PayrollApprovedOvertime[];
  contractMonthlyAllowance?: number;
  contractAttendanceIncentive?: number;
  contractAllowances?: Array<{ label: string; amount: number }>;
  contractIncentives?: ContractCompItem[];
  allowances?: number;
  hrBonuses?: number;
  hrOtherDeductions?: number;
  customRemarks?: string;
}

export interface ComputedDemoPayslip {
  basic_pay: number;
  overtime_pay: number;
  allowances: number;
  bonuses: number;
  gross_pay: number;
  sss_contribution: number;
  philhealth_contrib: number;
  pagibig_contrib: number;
  withholding_tax: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  remarks: string;
  breakdown: {
    dailyRate: number;
    hourlyRate: number;
    eligibleOtMinutes: number;
    eligibleOtHours: number;
    regularOtMinutes: number;
    regularOtPay: number;
    rdotRegularMinutes: number;
    rdotExcessMinutes: number;
    rdotPay: number;
    nightDiffMinutes: number;
    nightDiffHours: number;
    nightDiffPay: number;
    deMinimisExemptAmount: number;
    taxableIncome: number;
    totalLateMinutes: number;
    lateDeduction: number;
    totalOverbreakMinutes: number;
    overbreakDeduction: number;
    unexcusedAbsentDays: number;
    absenceDeduction: number;
    periodContractAllowance: number;
    attendanceIncentiveAwarded: number;
    attendanceIncentiveForfeited: boolean;
    performanceIncentivesAwarded: number;
    isProrated: boolean;
    prorateFactor: number;
    hrBonuses: number;
    hrOtherDeductions: number;
  };
}

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseHm(hm: string | null | undefined, fallbackH: number, fallbackM: number): [number, number] {
  const parts = String(hm ?? "").trim().split(":");
  const h = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  return [
    Number.isFinite(h) ? h : fallbackH,
    Number.isFinite(m) ? m : fallbackM,
  ];
}

function toPhtDateStr(ms: number): string {
  const d = new Date(ms + PHT_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function phtDateHmToUtcMs(dateIso: string, hour: number, minute: number): number {
  const baseUtc = Date.parse(`${dateIso}T00:00:00Z`);
  return baseUtc - PHT_OFFSET_MS + (hour * 60 + minute) * 60_000;
}

function computeNightDiffMinutes(clockInMs: number, clockOutMs: number): number {
  if (clockOutMs <= clockInMs) return 0;

  const startDate = new Date(`${toPhtDateStr(clockInMs)}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 1);
  const endDate = new Date(`${toPhtDateStr(clockOutMs)}T00:00:00Z`);

  let totalMinutes = 0;
  const cursor = new Date(startDate.getTime());

  while (cursor <= endDate) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    const dayIso = `${y}-${m}-${d}`;

    const winStartMs = phtDateHmToUtcMs(dayIso, 22, 0);
    const winEndMs = winStartMs + 8 * 60 * 60_000; // 06:00 next day PHT

    const overlapStart = Math.max(clockInMs, winStartMs);
    const overlapEnd = Math.min(clockOutMs, winEndMs);
    if (overlapEnd > overlapStart) {
      totalMinutes += Math.floor((overlapEnd - overlapStart) / 60_000);
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return totalMinutes;
}

const DAY_NUM_TO_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function computeMonthlyBirTrainTax(monthlyTaxable: number): number {
  if (monthlyTaxable <= 20_833.33) return 0;
  if (monthlyTaxable < 33_333) {
    return (monthlyTaxable - 20_833.33) * 0.15;
  }
  if (monthlyTaxable < 66_667) {
    return 1_875 + (monthlyTaxable - 33_333) * 0.20;
  }
  if (monthlyTaxable < 166_667) {
    return 8_541.80 + (monthlyTaxable - 66_667) * 0.25;
  }
  if (monthlyTaxable < 666_667) {
    return 33_541.80 + (monthlyTaxable - 166_667) * 0.30;
  }
  return 183_541.80 + (monthlyTaxable - 666_667) * 0.35;
}

function computeDeMinimisMonthlyExempt(label: string, monthlyAmount: number): number {
  const lower = label.toLowerCase();
  const amt = Math.max(0, monthlyAmount);
  if (lower.includes("rice")) return Math.min(amt, 2_000);
  if (lower.includes("clothing") || lower.includes("uniform")) return Math.min(amt, 500);
  if (lower.includes("laundry")) return Math.min(amt, 300);
  if (lower.includes("medical")) return Math.min(amt, 833.33);
  if (lower.includes("meal")) return Math.min(amt, 2_000);
  if (lower.includes("de minimis") || lower.includes("deminimis")) return Math.min(amt, 2_000);
  return 0;
}

function countScheduledWorkdays(
  startIso: string,
  endIso: string,
  workDays: string[] | null | undefined
): number {
  const startMs = Date.parse(`${startIso}T00:00:00Z`);
  const endMs = Date.parse(`${endIso}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return 0;

  const allowed = new Set(
    (Array.isArray(workDays) && workDays.length > 0
      ? workDays
      : ["Mon", "Tue", "Wed", "Thu", "Fri"]
    ).map((d) => d.trim().slice(0, 3).toLowerCase())
  );

  let count = 0;
  const cursor = new Date(startMs);
  while (cursor.getTime() <= endMs) {
    const short = DAY_NUM_TO_SHORT[cursor.getUTCDay()].toLowerCase();
    if (allowed.has(short)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function computeEmployeeDemoPayslip(
  input: ComputeEmployeeDemoPayslipInput
): ComputedDemoPayslip {
  const monthlyBase = Math.max(0, Number(input.monthlyBaseSalary || 0));
  const freq = String(input.payFrequency ?? "monthly").toLowerCase();
  const isSemiOrBiweekly = freq === "semi_monthly" || freq === "biweekly";
  const freqDivisor = isSemiOrBiweekly ? 2 : 1;

  // Mid-cutoff pro-rata calculation
  const rawEffectiveStart = input.startDate ?? input.hireDate ?? null;
  const startDateIso = rawEffectiveStart ? String(rawEffectiveStart).slice(0, 10) : null;
  let isProrated = false;
  let prorateFactor = 1;
  if (startDateIso && startDateIso > input.periodStart) {
    isProrated = true;
    if (startDateIso > input.periodEnd) {
      prorateFactor = 0;
    } else {
      const totalScheduled = countScheduledWorkdays(
        input.periodStart,
        input.periodEnd,
        input.workDays
      );
      const fromStartScheduled = countScheduledWorkdays(
        startDateIso,
        input.periodEnd,
        input.workDays
      );
      prorateFactor = totalScheduled > 0 ? fromStartScheduled / totalScheduled : 1;
    }
  }

  const dailyRate = monthlyBase / 22;
  const hourlyRate = dailyRate / 8;
  const basicPay = round2((monthlyBase / freqDivisor) * prorateFactor);

  const [shiftStartH, shiftStartM] = parseHm(input.shiftStart, 8, 0);
  const [shiftEndH, shiftEndM] = parseHm(input.shiftEnd, 17, 0);

  let eligibleOtMinutes = 0;
  let rdotRegularMinutes = 0;
  let rdotExcessMinutes = 0;
  let nightDiffMinutes = 0;
  let regularOtNsdMinutes = 0;
  let rdotNsdMinutes = 0;
  let totalLateMinutes = 0;
  let totalOverbreakMinutes = 0;

  const rdotDates = new Set<string>(
    (input.approvedOvertimes ?? [])
      .filter((ot) => ot.overtime_type === "rdot" && ot.work_date)
      .map((ot) => String(ot.work_date).slice(0, 10))
  );

  // Group RDOT minutes per work_date so first 8h (480m) = 1.30x and >8h = 1.69x
  const rdotMinutesByDate = new Map<string, number>();
  for (const ot of input.approvedOvertimes ?? []) {
    if (ot.start_time && ot.end_time) {
      const win = computeOvertimeWindowMinutes(ot.start_time, ot.end_time);
      if (!win.valid) continue;

      if (ot.work_date) {
        const [otSH, otSM] = parseTimeHm(ot.start_time, 0, 0);
        const [otEH, otEM] = parseTimeHm(ot.end_time, 0, 0);
        const otStartUtc = phtDateHmToUtcMs(ot.work_date.slice(0, 10), otSH, otSM);
        let otEndUtc = phtDateHmToUtcMs(ot.work_date.slice(0, 10), otEH, otEM);
        if (otEndUtc <= otStartUtc) otEndUtc += 24 * 60 * 60_000;
        const otNsd = computeNsdMinutes(otStartUtc, otEndUtc);
        if (ot.overtime_type === "rdot") {
          rdotNsdMinutes += otNsd;
        } else {
          regularOtNsdMinutes += otNsd;
        }
      }

      if (ot.overtime_type === "rdot") {
        const key = String(ot.work_date ?? "rdot").slice(0, 10);
        rdotMinutesByDate.set(key, (rdotMinutesByDate.get(key) ?? 0) + win.durationMinutes);
      }
    }
  }

  for (const mins of rdotMinutesByDate.values()) {
    const first8h = Math.min(480, mins);
    const excess = Math.max(0, mins - 480);
    rdotRegularMinutes += first8h;
    rdotExcessMinutes += excess;
  }

  for (const log of input.attendanceLogs) {
    if (!log.clock_in) continue;
    const clockInMs = Date.parse(log.clock_in);
    if (Number.isNaN(clockInMs)) continue;

    // Cross-midnight-safe shift window resolution (handles Graveyard 22:00–07:00)
    const { shiftStartUtcMs, shiftEndUtcMs } = resolveShiftWindowForClockIn(
      clockInMs,
      input.shiftStart,
      input.shiftEnd
    );

    let rawLateMinutes = 0;
    if (!log.is_rest_day_work) {
      if (typeof log.late_minutes === "number" && log.late_minutes > 0) {
        rawLateMinutes = Math.floor(log.late_minutes);
      } else {
        const diffLate = Math.floor((clockInMs - shiftStartUtcMs) / 60_000);
        if (diffLate > 5) {
          rawLateMinutes = diffLate;
        }
      }
    }
    const effectiveLateMinutes = Math.min(480, Math.max(0, rawLateMinutes));
    totalLateMinutes += effectiveLateMinutes;

    let rawOverbreakMinutes = 0;
    const explicitOverbreak = Number(log.overbreak_minutes ?? 0);
    if (explicitOverbreak > 0) {
      rawOverbreakMinutes = Math.floor(explicitOverbreak);
    } else {
      const lunchOver = Math.max(0, Number(log.total_lunch_minutes ?? 0) - 60);
      const shortOver = Math.max(0, Number(log.total_break_minutes ?? 0) - 30);
      rawOverbreakMinutes = Math.floor(lunchOver + shortOver);
    }
    const effectiveOverbreakMinutes = Math.min(
      Math.max(0, 480 - effectiveLateMinutes),
      Math.max(0, rawOverbreakMinutes)
    );
    totalOverbreakMinutes += effectiveOverbreakMinutes;

    if (!log.clock_out) continue;
    const clockOutMs = Date.parse(log.clock_out);
    if (Number.isNaN(clockOutMs) || clockOutMs <= clockInMs) continue;

    const elapsedClockMinutes = Math.max(0, Math.floor((clockOutMs - clockInMs) / 60_000));
    const unpaidLunchMinutes = Math.max(60, Number(log.total_lunch_minutes ?? 60));
    const netWorkedMinutes = Math.max(0, elapsedClockMinutes - unpaidLunchMinutes);

    const logDateIso =
      (log.date ? String(log.date).slice(0, 10) : null) ??
      toPhtDateStr(clockInMs);
    const isRdotLog = Boolean(log.is_rest_day_work) || rdotDates.has(logDateIso);

    const otPastShiftEndMinutes = Math.floor((clockOutMs - shiftEndUtcMs) / 60_000);
    if (!isRdotLog && otPastShiftEndMinutes >= 30 && netWorkedMinutes > 480) {
      eligibleOtMinutes += Math.min(120, otPastShiftEndMinutes, netWorkedMinutes - 480);
    }

    const logNsdMinutes =
      typeof log.night_diff_minutes === "number" && log.night_diff_minutes > 0
        ? Math.floor(log.night_diff_minutes)
        : computeNsdMinutes(clockInMs, clockOutMs);
    nightDiffMinutes += logNsdMinutes;
  }

  const totalOtMinutes = eligibleOtMinutes + rdotRegularMinutes + rdotExcessMinutes;
  const eligibleOtHours = round2(totalOtMinutes / 60);
  const nightDiffHours = round2(nightDiffMinutes / 60);

  const regularOtPay = round2((eligibleOtMinutes / 60) * hourlyRate * 1.25);
  const rdotRegularPay = round2((rdotRegularMinutes / 60) * hourlyRate * 1.30);
  const rdotExcessPay = round2((rdotExcessMinutes / 60) * hourlyRate * 1.69);
  const rdotPay = round2(rdotRegularPay + rdotExcessPay);
  const overtimePay = round2(regularOtPay + rdotPay);

  // NSD: 10% base NSD + compounded 1.25*0.10 / 1.30*0.10 for NSD inside approved OT/RDOT
  const otNsdTotal = regularOtNsdMinutes + rdotNsdMinutes;
  const baseNsdFromLogs = Math.max(0, nightDiffMinutes - otNsdTotal);
  const baseNsdPay = (baseNsdFromLogs / 60) * hourlyRate * 0.10;
  const regularOtNsdPay = (regularOtNsdMinutes / 60) * hourlyRate * 1.25 * 0.10;
  const rdotNsdPay = (rdotNsdMinutes / 60) * hourlyRate * 1.30 * 0.10;
  const nightDiffPay = round2(baseNsdPay + regularOtNsdPay + rdotNsdPay);

  const itemizedAllowances = (input.contractAllowances ?? []).filter((a) => a.amount > 0);
  const allowanceSumMonthly =
    itemizedAllowances.length > 0
      ? itemizedAllowances.reduce((sum, a) => sum + Math.max(0, a.amount), 0)
      : Math.max(0, Number(input.contractMonthlyAllowance ?? 0));

  const periodContractAllowance = round2(
    (allowanceSumMonthly / freqDivisor) * prorateFactor
  );

  const oneTimeAllowances = round2(Math.max(0, Number(input.allowances ?? 0)));
  const allowances = round2(periodContractAllowance + oneTimeAllowances);
  const hrBonuses = round2(Math.max(0, Number(input.hrBonuses ?? 0)));

  const { absentDays: unexcusedAbsentDays } = computeUnexcusedAbsences({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    effectiveStartDate: startDateIso,
    workDays: input.workDays,
    shiftEnd: input.shiftEnd,
    attendanceLogs: input.attendanceLogs,
    approvedLeaves: input.approvedLeaves,
  });

  const itemizedIncentives = (input.contractIncentives ?? []).filter((i) => i.amount > 0);
  let attendanceIncentiveAwarded = 0;
  let attendanceIncentiveForfeited = false;
  let performanceIncentivesAwarded = 0;
  const awardedIncentiveLabels: string[] = [];

  if (itemizedIncentives.length > 0) {
    for (const inc of itemizedIncentives) {
      const periodAmt = round2((inc.amount / freqDivisor) * prorateFactor);
      const isAttendanceType =
        inc.type === "attendance" ||
        inc.label.toLowerCase().includes("attendance");
      if (isAttendanceType) {
        if (totalLateMinutes === 0 && unexcusedAbsentDays === 0 && periodAmt > 0) {
          attendanceIncentiveAwarded = round2(attendanceIncentiveAwarded + periodAmt);
          awardedIncentiveLabels.push(`${inc.label} (+₱${periodAmt.toFixed(2)})`);
        } else {
          attendanceIncentiveForfeited = true;
        }
      } else if (periodAmt > 0) {
        performanceIncentivesAwarded = round2(performanceIncentivesAwarded + periodAmt);
        awardedIncentiveLabels.push(`${inc.label} (+₱${periodAmt.toFixed(2)})`);
      }
    }
  } else {
    const contractAttendanceIncentive = Math.max(0, Number(input.contractAttendanceIncentive ?? 0));
    const periodAttendanceIncentive = round2(
      (contractAttendanceIncentive / freqDivisor) * prorateFactor
    );
    if (periodAttendanceIncentive > 0) {
      if (totalLateMinutes === 0 && unexcusedAbsentDays === 0) {
        attendanceIncentiveAwarded = periodAttendanceIncentive;
        awardedIncentiveLabels.push(
          `Attendance Incentive (+₱${attendanceIncentiveAwarded.toFixed(2)})`
        );
      } else {
        attendanceIncentiveForfeited = true;
      }
    }
  }

  const bonuses = round2(
    nightDiffPay + hrBonuses + attendanceIncentiveAwarded + performanceIncentivesAwarded
  );

  const lateDeduction = round2((totalLateMinutes / 60) * hourlyRate);
  const overbreakDeduction = round2((totalOverbreakMinutes / 60) * hourlyRate);
  const absenceDeduction = round2(unexcusedAbsentDays * dailyRate);
  const hrOtherDeductions = round2(Math.max(0, Number(input.hrOtherDeductions ?? 0)));

  const grossPay = round2(basicPay + overtimePay + allowances + bonuses);

  // 1. SSS (2025/2026): 5% Employee Share on MSC ₱5,000–₱35,000 (₱250–₱1,750/mo)
  const monthlyMsc =
    monthlyBase > 0
      ? Math.min(35_000, Math.max(5_000, Math.round(monthlyBase / 500) * 500))
      : 0;
  const monthlySss = monthlyMsc > 0 ? round2(monthlyMsc * 0.05) : 0;
  const sss = round2(monthlySss / freqDivisor);

  // 2. PhilHealth: 5% total / 2.5% EE share, ₱10,000 floor (₱250/mo) and ₱100,000 ceiling (₱2,500/mo)
  const monthlyPhilhealth =
    monthlyBase > 0
      ? round2(Math.min(2_500, Math.max(250, monthlyBase * 0.025)))
      : 0;
  const philhealth = round2(monthlyPhilhealth / freqDivisor);

  // 3. Pag-IBIG: 2% EE share capped at ₱200.00/mo (₱100/cutoff on semi-monthly)
  const monthlyPagibig =
    monthlyBase > 0 ? round2(Math.min(200, monthlyBase * 0.02)) : 0;
  const pagibig = round2(monthlyPagibig / freqDivisor);

  // 4. De Minimis Tax Shield (BIR statutory exemptions)
  const monthlyDeMinimisExempt = itemizedAllowances.reduce(
    (sum, item) => sum + computeDeMinimisMonthlyExempt(item.label, item.amount),
    0
  );
  const deMinimisExemptAmount = round2(
    (monthlyDeMinimisExempt / freqDivisor) * prorateFactor
  );

  // 5. BIR TRAIN Withholding Tax (annualized/monthly brackets scaled by pay frequency)
  const taxableIncome = round2(
    Math.max(0, grossPay - deMinimisExemptAmount - sss - philhealth - pagibig)
  );
  const monthlyEquivalentTaxable = taxableIncome * freqDivisor;
  const withholdingTax = round2(
    computeMonthlyBirTrainTax(monthlyEquivalentTaxable) / freqDivisor
  );

  const otherDeductions = round2(
    lateDeduction + overbreakDeduction + absenceDeduction + hrOtherDeductions
  );
  const totalDeductions = round2(
    sss + philhealth + pagibig + withholdingTax + otherDeductions
  );
  const netPay = round2(Math.max(0, grossPay - totalDeductions));

  const rdotTotalHours = round2((rdotRegularMinutes + rdotExcessMinutes) / 60);
  const remarksParts = [
    `Demo Computation (${freq})`,
    `OT: ${round2(eligibleOtMinutes / 60).toFixed(2)}h (₱${regularOtPay.toFixed(2)})`,
    ...(rdotTotalHours > 0
      ? [
          `RDOT: ${rdotTotalHours.toFixed(2)}h (₱${rdotPay.toFixed(2)}${
            rdotExcessMinutes > 0
              ? ` incl. ${round2(rdotExcessMinutes / 60).toFixed(2)}h @1.69x`
              : " @1.30x"
          })`,
        ]
      : []),
    `Night Diff: ${nightDiffHours.toFixed(2)}h (₱${nightDiffPay.toFixed(2)})`,
    `Late: ${totalLateMinutes}m (-₱${lateDeduction.toFixed(2)})`,
    `Absent: ${unexcusedAbsentDays}d (-₱${absenceDeduction.toFixed(2)})`,
  ];
  if (isProrated && startDateIso) {
    remarksParts.push(`Prorated from start date ${startDateIso}`);
  }
  if (totalOverbreakMinutes > 0) {
    remarksParts.push(`Overbreak deduction: ${totalOverbreakMinutes}m (-₱${overbreakDeduction.toFixed(2)})`);
  }
  if (itemizedAllowances.length > 0) {
    const itemizedText = itemizedAllowances
      .map((a) => `${a.label} (+₱${round2((a.amount / freqDivisor) * prorateFactor).toFixed(2)})`)
      .join(", ");
    remarksParts.push(`Allowances: ${itemizedText}`);
  } else if (periodContractAllowance > 0) {
    remarksParts.push(`Allowance: +₱${periodContractAllowance.toFixed(2)}`);
  }
  if (awardedIncentiveLabels.length > 0) {
    remarksParts.push(`Incentives: ${awardedIncentiveLabels.join(", ")}`);
  }
  if (attendanceIncentiveForfeited) {
    remarksParts.push("Attendance Incentive forfeited (late/absent)");
  }
  if (input.customRemarks?.trim()) {
    remarksParts.push(input.customRemarks.trim());
  }

  return {
    basic_pay: basicPay,
    overtime_pay: overtimePay,
    allowances,
    bonuses,
    gross_pay: grossPay,
    sss_contribution: sss,
    philhealth_contrib: philhealth,
    pagibig_contrib: pagibig,
    withholding_tax: withholdingTax,
    other_deductions: otherDeductions,
    total_deductions: totalDeductions,
    net_pay: netPay,
    remarks: remarksParts.join(" | "),
    breakdown: {
      dailyRate: round2(dailyRate),
      hourlyRate: round2(hourlyRate),
      eligibleOtMinutes,
      eligibleOtHours,
      regularOtMinutes: eligibleOtMinutes,
      regularOtPay,
      rdotRegularMinutes,
      rdotExcessMinutes,
      rdotPay,
      nightDiffMinutes,
      nightDiffHours,
      nightDiffPay,
      deMinimisExemptAmount,
      taxableIncome,
      totalLateMinutes,
      lateDeduction,
      totalOverbreakMinutes,
      overbreakDeduction,
      unexcusedAbsentDays,
      absenceDeduction,
      periodContractAllowance,
      attendanceIncentiveAwarded,
      attendanceIncentiveForfeited,
      performanceIncentivesAwarded,
      isProrated,
      prorateFactor: round2(prorateFactor),
      hrBonuses,
      hrOtherDeductions,
    },
  };
}
