import {
  computeUnexcusedAbsences,
  type ApprovedLeaveLike,
} from "@/lib/attendance-absent";

export interface PayrollAttendanceLog {
  date?: string | null;
  clock_in?: string | null;
  clock_out?: string | null;
  late_minutes?: number | null;
  overbreak_minutes?: number | null;
  total_lunch_minutes?: number | null;
  total_break_minutes?: number | null;
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
  shiftStart?: string | null;
  shiftEnd?: string | null;
  workDays?: string[] | null;
  attendanceLogs: PayrollAttendanceLog[];
  approvedLeaves: ApprovedLeaveLike[];
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
    nightDiffMinutes: number;
    nightDiffHours: number;
    nightDiffPay: number;
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
  const startDateIso = input.startDate ? String(input.startDate).slice(0, 10) : null;
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
  let nightDiffMinutes = 0;
  let totalLateMinutes = 0;
  let totalOverbreakMinutes = 0;

  for (const log of input.attendanceLogs) {
    if (!log.clock_in) continue;
    const clockInMs = Date.parse(log.clock_in);
    if (Number.isNaN(clockInMs)) continue;

    const phtDay = toPhtDateStr(clockInMs);
    const shiftStartMs = phtDateHmToUtcMs(phtDay, shiftStartH, shiftStartM);

    if (typeof log.late_minutes === "number" && log.late_minutes > 0) {
      totalLateMinutes += Math.floor(log.late_minutes);
    } else {
      const diffLate = Math.floor((clockInMs - shiftStartMs) / 60_000);
      if (diffLate > 5) {
        totalLateMinutes += diffLate;
      }
    }

    const explicitOverbreak = Number(log.overbreak_minutes ?? 0);
    if (explicitOverbreak > 0) {
      totalOverbreakMinutes += Math.floor(explicitOverbreak);
    } else {
      const lunchOver = Math.max(0, Number(log.total_lunch_minutes ?? 0) - 60);
      const shortOver = Math.max(0, Number(log.total_break_minutes ?? 0) - 30);
      totalOverbreakMinutes += Math.floor(lunchOver + shortOver);
    }

    if (!log.clock_out) continue;
    const clockOutMs = Date.parse(log.clock_out);
    if (Number.isNaN(clockOutMs) || clockOutMs <= clockInMs) continue;

    let shiftEndMs = phtDateHmToUtcMs(phtDay, shiftEndH, shiftEndM);
    if (shiftEndMs <= shiftStartMs) {
      shiftEndMs += 24 * 60 * 60_000;
    }

    const rawOtMinutes = Math.floor((clockOutMs - shiftEndMs) / 60_000);
    if (rawOtMinutes >= 30) {
      eligibleOtMinutes += Math.min(rawOtMinutes, 120);
    }

    nightDiffMinutes += computeNightDiffMinutes(clockInMs, clockOutMs);
  }

  const eligibleOtHours = round2(eligibleOtMinutes / 60);
  const nightDiffHours = round2(nightDiffMinutes / 60);

  const overtimePay = round2((eligibleOtMinutes / 60) * hourlyRate * 1.25);
  const nightDiffPay = round2((nightDiffMinutes / 60) * hourlyRate * 0.10);

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

  const sssCap = isSemiOrBiweekly ? 675 : 1_350;
  const sss = round2(Math.min(basicPay * 0.045, sssCap));
  const philhealth = round2(basicPay * 0.025);
  const pagibig = basicPay > 0 ? (isSemiOrBiweekly ? 100 : 200) : 0;

  const taxableBase = Math.max(0, grossPay - sss - philhealth - pagibig);
  const taxThreshold = isSemiOrBiweekly ? 20_833 / 2 : 20_833;
  const withholdingTax = round2(
    taxableBase > taxThreshold ? (taxableBase - taxThreshold) * 0.15 : 0
  );

  const otherDeductions = round2(
    lateDeduction + overbreakDeduction + absenceDeduction + hrOtherDeductions
  );
  const totalDeductions = round2(
    sss + philhealth + pagibig + withholdingTax + otherDeductions
  );
  const netPay = round2(Math.max(0, grossPay - totalDeductions));

  const remarksParts = [
    `Demo Computation (${freq})`,
    `OT: ${eligibleOtHours.toFixed(2)}h (₱${overtimePay.toFixed(2)})`,
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
      nightDiffMinutes,
      nightDiffHours,
      nightDiffPay,
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
