import { describe, expect, it } from "vitest";
import {
  formatLeaveCreditsDisplay,
  formatLeaveTypeDisplayLabel,
  isSpecialStatutoryLeave,
  mapToLedgerLeaveType,
  normalizeLeavePolicyConfig,
  resolveLeavePolicyFromSources,
  toDbLeaveTypeEnum,
  toLedgerLeaveCode,
} from "@/lib/leave-policy";
import {
  calculateShiftAttendanceMetrics,
  computeNsdMinutes,
  computeOvertimeWindowMinutes,
  validateAndClassifyOvertimeRequest,
} from "@/lib/shift-calculations";
import { computeEmployeeDemoPayslip } from "@/lib/payroll-calculator";
import { resolveDailyWorkModel } from "@/lib/work-arrangement";

describe("Phase 2 Pillar 1: Leave Policy & Formatting", () => {
  it("formats Standard PH Company Package (15 VL + 15 SL)", () => {
    const policy = normalizeLeavePolicyConfig({
      leave_policy_type: "company_standard",
      leave_eligibility: "upon_regularization",
    });

    expect(policy.vacation_leave_days).toBe(15);
    expect(policy.sick_leave_days).toBe(15);
    expect(formatLeaveCreditsDisplay(policy)).toBe(
      "15 Vacation Leave + 15 Sick Leave / year (Upon Regularization)"
    );
  });

  it("formats Statutory Minimum SIL (Labor Code Art. 95)", () => {
    const policy = normalizeLeavePolicyConfig({
      leave_policy_type: "statutory_sil",
      service_incentive_leave_days: 5,
    });

    expect(policy.vacation_leave_days).toBe(0);
    expect(policy.sick_leave_days).toBe(0);
    expect(policy.service_incentive_leave_days).toBe(5);
    expect(formatLeaveCreditsDisplay(policy)).toContain(
      "5 Service Incentive Leave (SIL) / year"
    );
  });

  it("maps form leave types and distinguishes special statutory leaves", () => {
    expect(mapToLedgerLeaveType("vacation")).toBe("VL");
    expect(mapToLedgerLeaveType("sick")).toBe("SL");
    expect(mapToLedgerLeaveType("SIL")).toBe("SIL");
    expect(mapToLedgerLeaveType("solo_parent")).toBe("SOLO_PARENT");
    expect(toLedgerLeaveCode("vacation")).toBe("VL");
    expect(toLedgerLeaveCode("VL")).toBe("VL");
    expect(toLedgerLeaveCode("sick")).toBe("SL");
    expect(toLedgerLeaveCode("SL")).toBe("SL");
    expect(toLedgerLeaveCode("sil")).toBe("SIL");
    expect(toDbLeaveTypeEnum("VL")).toBe("vacation");
    expect(toDbLeaveTypeEnum("vacation")).toBe("vacation");
    expect(toDbLeaveTypeEnum("SL")).toBe("sick");
    expect(toDbLeaveTypeEnum("SIL")).toBe("sil");
    expect(toDbLeaveTypeEnum("SOLO_PARENT")).toBe("solo_parent");
    expect(toDbLeaveTypeEnum("MAGNA_CARTA")).toBe("magna_carta");
    expect(formatLeaveTypeDisplayLabel("VL")).toBe("Vacation Leave (VL)");
    expect(formatLeaveTypeDisplayLabel("vacation")).toBe("Vacation Leave (VL)");
    expect(isSpecialStatutoryLeave("MATERNITY")).toBe(true);
    expect(isSpecialStatutoryLeave("VAWC")).toBe(true);
    expect(isSpecialStatutoryLeave("MAGNA_CARTA")).toBe(true);
    expect(isSpecialStatutoryLeave("VL")).toBe(false);
  });

  it("prefers structured columns over legacy metadata when resolving policy", () => {
    const policy = resolveLeavePolicyFromSources(
      {
        leave_policy_type: "custom",
        vacation_leave_days: 15,
        sick_leave_days: 10,
        service_incentive_leave_days: 0,
        leave_eligibility: "day_1",
      },
      { vacation_leave_days: 12, sick_leave_days: 12 }
    );

    expect(policy.vacation_leave_days).toBe(15);
    expect(policy.sick_leave_days).toBe(10);
    expect(policy.leave_eligibility).toBe("day_1");
  });
});

describe("Phase 2 Pillar 3: Overnight Shift, Undertime & 10% NSD Calculations", () => {
  it("computes cross-midnight Graveyard shift (22:00–07:00 PHT) without negative duration", () => {
    // 2026-12-01 22:00 PHT = 2026-12-01T14:00:00Z
    // 2026-12-02 07:00 PHT = 2026-12-01T23:00:00Z
    const result = calculateShiftAttendanceMetrics({
      clockIn: "2026-12-01T14:00:00Z",
      clockOut: "2026-12-01T23:00:00Z",
      shiftStart: "22:00",
      shiftEnd: "07:00",
      unpaidBreakMinutes: 60,
    });

    expect(result.isOvernightShift).toBe(true);
    expect(result.workedHours).toBe(8);
    expect(result.isLate).toBe(false);
    expect(result.lateMinutes).toBe(0);
    expect(result.undertimeMinutes).toBe(0);
    // 22:00 to 06:00 PHT = 8 hours = 480 minutes NSD
    expect(result.nightDiffMinutes).toBe(480);
    expect(result.nightDiffHours).toBe(8);
  });

  it("computes late minutes correctly when clocking in after midnight for a 22:00–07:00 shift", () => {
    // 2026-12-02 00:15 PHT = 2026-12-01T16:15:00Z (135 mins after 22:00 PHT)
    const result = calculateShiftAttendanceMetrics({
      clockIn: "2026-12-01T16:15:00Z",
      clockOut: "2026-12-01T22:30:00Z", // 06:30 PHT -> 30 mins undertime
      shiftStart: "22:00",
      shiftEnd: "07:00",
    });

    expect(result.isOvernightShift).toBe(true);
    expect(result.isLate).toBe(true);
    expect(result.lateMinutes).toBe(135);
    expect(result.undertimeMinutes).toBe(30);
    // 00:15 to 06:00 PHT = 345 mins NSD
    expect(result.nightDiffMinutes).toBe(345);
  });

  it("returns 0 NSD minutes for a standard daytime 08:00–17:00 PHT shift", () => {
    // 2026-12-01 08:00 PHT = 2026-12-01T00:00:00Z
    // 2026-12-01 17:00 PHT = 2026-12-01T09:00:00Z
    const nsd = computeNsdMinutes(
      Date.parse("2026-12-01T00:00:00Z"),
      Date.parse("2026-12-01T09:00:00Z")
    );
    expect(nsd).toBe(0);
  });
});

describe("Phase 2 Pillar 3: Per-Day daily_work_modes Resolution", () => {
  it("resolves onsite, wfh, and rest days from daily_work_modes map", () => {
    const dailyWorkModes = {
      Mon: "onsite",
      Tue: "wfh",
      Wed: "onsite",
      Thu: "wfh",
      Fri: "onsite",
      Sat: "rest",
      Sun: "rest",
    };

    // 2026-12-01 is Tuesday PHT
    expect(
      resolveDailyWorkModel({
        contractWorkSetup: "hybrid",
        schedule: { daily_work_modes: dailyWorkModes },
        date: new Date("2026-12-01T02:00:00Z"),
      })
    ).toBe("wfh");

    // 2026-12-02 is Wednesday PHT
    expect(
      resolveDailyWorkModel({
        contractWorkSetup: "hybrid",
        schedule: { daily_work_modes: dailyWorkModes },
        date: new Date("2026-12-02T02:00:00Z"),
      })
    ).toBe("onsite");

    // 2026-12-05 is Saturday PHT
    expect(
      resolveDailyWorkModel({
        contractWorkSetup: "hybrid",
        schedule: { daily_work_modes: dailyWorkModes },
        date: new Date("2026-12-05T02:00:00Z"),
      })
    ).toBe("off");
  });
});

describe("Phase 2 Stabilization: Payroll 10% NSD Sync", () => {
  it("reads night_diff_minutes from attendance_logs and computes 10% NSD earnings", () => {
    const payslip = computeEmployeeDemoPayslip({
      monthlyBaseSalary: 22000,
      payFrequency: "monthly",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-01",
      shiftStart: "22:00",
      shiftEnd: "07:00",
      workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      attendanceLogs: [
        {
          date: "2026-12-01",
          clock_in: "2026-12-01T14:00:00Z",
          clock_out: "2026-12-01T23:00:00Z",
          night_diff_minutes: 480,
          late_minutes: 0,
        },
      ],
      approvedLeaves: [],
    });

    // dailyRate = 22000 / 22 = 1000; hourlyRate = 125; 8h * 125 * 0.10 = 100
    expect(payslip.breakdown.nightDiffMinutes).toBe(480);
    expect(payslip.breakdown.nightDiffHours).toBe(8);
    expect(payslip.breakdown.nightDiffPay).toBe(100);
    expect(payslip.bonuses).toBe(100);
    expect(payslip.remarks).toContain("Night Diff: 8.00h (₱100.00)");
  });
});

describe("Phase 2 Stabilization: Cross-Midnight OT & 1.30x RDOT", () => {
  it("supports cross-midnight OT window (20:00 -> 05:00 = 9.0 hours)", () => {
    const res = computeOvertimeWindowMinutes("20:00", "05:00");
    expect(res.valid).toBe(true);
    expect(res.crossesMidnight).toBe(true);
    expect(res.durationMinutes).toBe(540);
    expect(res.durationHours).toBe(9);
  });

  it("rejects 0-minute or >16h overtime windows", () => {
    expect(computeOvertimeWindowMinutes("08:00", "08:00").valid).toBe(false);
    expect(computeOvertimeWindowMinutes("06:00", "23:00").valid).toBe(false);
  });

  it("applies 1.30x rest-day multiplier in payroll when overtime_type === 'rdot'", () => {
    const payslip = computeEmployeeDemoPayslip({
      monthlyBaseSalary: 22000,
      payFrequency: "monthly",
      periodStart: "2026-12-06",
      periodEnd: "2026-12-06",
      shiftStart: "08:00",
      shiftEnd: "17:00",
      workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      attendanceLogs: [],
      approvedLeaves: [],
      approvedOvertimes: [
        {
          work_date: "2026-12-06",
          start_time: "20:00",
          end_time: "05:00",
          overtime_type: "rdot",
        },
      ],
    });

    // hourlyRate = 125; 8h * 125 * 1.30 (1300) + 1h * 125 * 1.69 (211.25) = 1511.25
    expect(payslip.breakdown.eligibleOtHours).toBe(9);
    expect(payslip.overtime_pay).toBe(1511.25);
  });
});

describe("Phase 2 Guardrails: Schedule-Driven Regular OT vs RDOT Validation", () => {
  const workDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const dailyWorkModes = {
    Mon: "onsite",
    Tue: "onsite",
    Wed: "wfh",
    Thu: "onsite",
    Fri: "onsite",
    Sat: "rest",
    Sun: "rest",
  };

  it("blocks rdot on a scheduled working day (2026-12-01 is Tuesday)", () => {
    const res = validateAndClassifyOvertimeRequest({
      workDate: "2026-12-01",
      startTime: "17:00",
      endTime: "19:00",
      requestedType: "rdot",
      workDays,
      dailyWorkModes,
      shiftStart: "08:00",
      shiftEnd: "17:00",
    });

    expect(res.valid).toBe(false);
    expect(res.isRestDay).toBe(false);
    expect(res.error).toContain("Cannot file Rest Day Overtime (RDOT) on a scheduled working day");
  });

  it("blocks regular_ot on a scheduled rest day (2026-12-05 is Saturday)", () => {
    const res = validateAndClassifyOvertimeRequest({
      workDate: "2026-12-05",
      startTime: "08:00",
      endTime: "17:00",
      requestedType: "regular_ot",
      workDays,
      dailyWorkModes,
      shiftStart: "08:00",
      shiftEnd: "17:00",
    });

    expect(res.valid).toBe(false);
    expect(res.isRestDay).toBe(true);
    expect(res.error).toContain("scheduled Rest Day");
  });

  it("blocks workday OT overlapping regular shift hours including cross-midnight 20:00-05:00 shift", () => {
    const overlapDay = validateAndClassifyOvertimeRequest({
      workDate: "2026-12-01",
      startTime: "15:00",
      endTime: "19:00",
      requestedType: "regular_ot",
      workDays,
      dailyWorkModes,
      shiftStart: "08:00",
      shiftEnd: "17:00",
    });
    expect(overlapDay.valid).toBe(false);
    expect(overlapDay.error).toContain("outside regular shift hours");

    const overlapNight = validateAndClassifyOvertimeRequest({
      workDate: "2026-12-01",
      startTime: "03:00",
      endTime: "06:00",
      requestedType: "regular_ot",
      workDays,
      dailyWorkModes,
      shiftStart: "20:00",
      shiftEnd: "05:00",
    });
    expect(overlapNight.valid).toBe(false);
    expect(overlapNight.error).toContain("outside regular shift hours");
  });

  it("allows post-shift OT (05:00-07:00 after 20:00-05:00 shift) and full-window RDOT on rest day", () => {
    const postNightOt = validateAndClassifyOvertimeRequest({
      workDate: "2026-12-01",
      startTime: "05:00",
      endTime: "07:00",
      requestedType: "regular_ot",
      workDays,
      dailyWorkModes,
      shiftStart: "20:00",
      shiftEnd: "05:00",
    });
    expect(postNightOt.valid).toBe(true);
    expect(postNightOt.resolvedType).toBe("regular_ot");
    expect(postNightOt.durationHours).toBe(2);

    const restDayRdot = validateAndClassifyOvertimeRequest({
      workDate: "2026-12-05",
      startTime: "20:00",
      endTime: "05:00",
      requestedType: "rdot",
      workDays,
      dailyWorkModes,
      shiftStart: "08:00",
      shiftEnd: "17:00",
    });
    expect(restDayRdot.valid).toBe(true);
    expect(restDayRdot.resolvedType).toBe("rdot");
    expect(restDayRdot.durationHours).toBe(9);
    expect(restDayRdot.crossesMidnight).toBe(true);
  });
});
