import { describe, expect, it } from "vitest";
import {
  computeLeaveOffsetDays,
  computeUndertimeMinutes,
  computeUndertimeWindow,
  formatTime12h,
  getTodayPhtDayShort,
  getTodayPhtIso,
  isTodayPht,
} from "@/lib/undertime";
import {
  computeUnexcusedAbsences,
  resolveEffectiveShiftEnd,
  resolveEffectiveShiftWindow,
} from "@/lib/attendance-absent";
import { computeEmployeeDemoPayslip } from "@/lib/payroll-calculator";

describe("Undertime Modes, 12h Formatting, Leave Offset & Payroll Reconciliation", () => {
  it("computes Asia/Manila (UTC+8) today date and day short across midnight UTC boundary", () => {
    // 2026-11-24T16:30:00Z is 2026-11-25 00:30 AM PHT (Wednesday)
    const phtMidnightPlus = new Date("2026-11-24T16:30:00Z");
    expect(getTodayPhtIso(phtMidnightPlus)).toBe("2026-11-25");
    expect(getTodayPhtDayShort(phtMidnightPlus)).toBe("Wed");
    expect(isTodayPht("2026-11-25", phtMidnightPlus)).toBe(true);
    expect(isTodayPht("2026-11-24", phtMidnightPlus)).toBe(false);
  });

  it("formats 24h times accurately to 12h (17:00 & 17:00:00 -> 05:00 PM)", () => {
    expect(formatTime12h("17:00")).toBe("05:00 PM");
    expect(formatTime12h("17:00:00")).toBe("05:00 PM");
    expect(formatTime12h("08:00")).toBe("08:00 AM");
    expect(formatTime12h("12:00")).toBe("12:00 PM");
    expect(formatTime12h("00:00")).toBe("12:00 AM");
  });

  it("computes early_out, late_in, half_day_first, and half_day_second with +4h split & lunch exclusion", () => {
    // Early out at 15:30 on 08:00-17:00 = 90m
    const earlyOut = computeUndertimeWindow({
      scheduledIn: "08:00",
      scheduledOut: "17:00",
      undertimeType: "early_out",
      requestedOut: "15:30",
    });
    expect(earlyOut.valid).toBe(true);
    expect(earlyOut.effectiveIn).toBe("08:00");
    expect(earlyOut.effectiveOut).toBe("15:30");
    expect(earlyOut.undertimeMinutes).toBe(90);

    // Early out at 11:30 on 08:00-17:00 excludes 12:00-13:00 lunch = 270m (not 330m)
    const earlyBeforeLunch = computeUndertimeWindow({
      scheduledIn: "08:00",
      scheduledOut: "17:00",
      undertimeType: "early_out",
      requestedOut: "11:30",
    });
    expect(earlyBeforeLunch.valid).toBe(true);
    expect(earlyBeforeLunch.undertimeMinutes).toBe(270);

    // Late arrival at 11:00 on 08:00-17:00 = 180m (works 11:00-17:00)
    const lateIn = computeUndertimeWindow({
      scheduledIn: "08:00",
      scheduledOut: "17:00",
      undertimeType: "late_in",
      requestedIn: "11:00",
    });
    expect(lateIn.valid).toBe(true);
    expect(lateIn.effectiveIn).toBe("11:00");
    expect(lateIn.effectiveOut).toBe("17:00");
    expect(lateIn.undertimeMinutes).toBe(180);

    // Late arrival at 14:00 on 08:00-17:00 excludes 12:00-13:00 lunch = 300m
    const lateAfterLunch = computeUndertimeWindow({
      scheduledIn: "08:00",
      scheduledOut: "17:00",
      undertimeType: "late_in",
      requestedIn: "14:00",
    });
    expect(lateAfterLunch.valid).toBe(true);
    expect(lateAfterLunch.undertimeMinutes).toBe(300);

    // 1st Half Off: works 13:00-17:00, 240m
    const firstHalf = computeUndertimeWindow({
      scheduledIn: "08:00",
      scheduledOut: "17:00",
      undertimeType: "half_day_first",
    });
    expect(firstHalf.valid).toBe(true);
    expect(firstHalf.effectiveIn).toBe("13:00");
    expect(firstHalf.effectiveOut).toBe("17:00");
    expect(firstHalf.undertimeMinutes).toBe(240);

    // 2nd Half Off: works 08:00-12:00, 240m
    const secondHalf = computeUndertimeWindow({
      scheduledIn: "08:00",
      scheduledOut: "17:00",
      undertimeType: "half_day_second",
    });
    expect(secondHalf.valid).toBe(true);
    expect(secondHalf.effectiveIn).toBe("08:00");
    expect(secondHalf.effectiveOut).toBe("12:00");
    expect(secondHalf.undertimeMinutes).toBe(240);
  });

  it("handles graveyard midnight crossings (22:00-07:00 -> out at 23:30 = 450m, out at 05:30 = 90m)", () => {
    const beforeMidnight = computeUndertimeMinutes("07:00", "23:30", "22:00");
    expect(beforeMidnight.valid).toBe(true);
    expect(beforeMidnight.undertimeMinutes).toBe(450);

    const afterMidnight = computeUndertimeMinutes("07:00", "05:30", "22:00");
    expect(afterMidnight.valid).toBe(true);
    expect(afterMidnight.undertimeMinutes).toBe(90);

    const graveyardHalf1 = computeUndertimeWindow({
      scheduledIn: "22:00",
      scheduledOut: "07:00",
      undertimeType: "half_day_first",
    });
    expect(graveyardHalf1.valid).toBe(true);
    expect(graveyardHalf1.effectiveIn).toBe("03:00");
    expect(graveyardHalf1.effectiveOut).toBe("07:00");
    expect(graveyardHalf1.undertimeMinutes).toBe(240);
  });

  it("computes fractional leave offset days accurately", () => {
    expect(computeLeaveOffsetDays(240)).toBe(0.5);
    expect(computeLeaveOffsetDays(120)).toBe(0.25);
    expect(computeLeaveOffsetDays(90)).toBe(0.1875);
  });

  it("shifts effectiveIn/effectiveOut for late_in, half_day_first, and half_day_second", () => {
    const lateWin = resolveEffectiveShiftWindow(
      { workDate: "2026-12-01", scheduledIn: "08:00", scheduledOut: "17:00" },
      {
        work_date: "2026-12-01",
        undertime_type: "late_in",
        requested_in: "11:00",
        requested_out: "17:00",
        status: "approved",
      }
    );
    expect(lateWin).toEqual({ effectiveIn: "11:00", effectiveOut: "17:00" });

    const half1Win = resolveEffectiveShiftWindow(
      { workDate: "2026-12-02", scheduledIn: "08:00", scheduledOut: "17:00" },
      {
        work_date: "2026-12-02",
        undertime_type: "half_day_first",
        requested_in: "13:00",
        requested_out: "17:00",
        status: "approved",
      }
    );
    expect(half1Win).toEqual({ effectiveIn: "13:00", effectiveOut: "17:00" });

    const half2End = resolveEffectiveShiftEnd("2026-12-03", "17:00", [
      {
        work_date: "2026-12-03",
        undertime_type: "half_day_second",
        requested_out: "12:00",
        status: "approved",
      },
    ]);
    expect(half2End).toBe("12:00");
  });

  it("treats approved half-day with valid clock-in as present (not absent) and avoids false late penalty", () => {
    // Employee has half_day_first (13:00-17:00) on 2026-12-01 and clocks in at 13:00 PHT (05:00 UTC)
    const absences = computeUnexcusedAbsences({
      periodStart: "2026-12-01",
      periodEnd: "2026-12-01",
      workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      shiftEnd: "17:00",
      attendanceLogs: [
        {
          date: "2026-12-01",
          clock_in: "2026-12-01T05:00:00Z", // 13:00 PHT
        },
      ],
      approvedLeaves: [],
      approvedUndertimes: [
        {
          work_date: "2026-12-01",
          undertime_type: "half_day_first",
          requested_in: "13:00",
          requested_out: "17:00",
          undertime_minutes: 240,
          deduction_mode: "leave_offset",
          status: "approved",
        },
      ],
    });
    expect(absences.absentDays).toBe(0);

    // Payroll calculator must NOT penalize 13:00 PHT clock-in as late or deduct cash for leave_offset
    const slip = computeEmployeeDemoPayslip({
      monthlyBaseSalary: 22_000,
      payFrequency: "monthly",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-01",
      shiftStart: "08:00",
      shiftEnd: "17:00",
      workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      attendanceLogs: [
        {
          date: "2026-12-01",
          clock_in: "2026-12-01T05:00:00Z", // 13:00 PHT
          clock_out: "2026-12-01T09:00:00Z", // 17:00 PHT
        },
      ],
      approvedLeaves: [],
      approvedUndertimes: [
        {
          work_date: "2026-12-01",
          undertime_type: "half_day_first",
          requested_in: "13:00",
          requested_out: "17:00",
          undertime_minutes: 240,
          deduction_mode: "leave_offset",
          status: "approved",
        },
      ],
    });
    expect(slip.breakdown.totalLateMinutes).toBe(0);
    expect(slip.breakdown.totalApprovedUndertimeMinutes).toBe(0);
    expect(slip.breakdown.undertimeDeduction).toBe(0);
  });

  it("deducts exact pro-rata pay (daily_rate / 480) * undertime_minutes for approved payroll_deduction undertime", () => {
    // 22,000/mo -> dailyRate = 1,000 -> (1,000 / 480) * 90 = 187.50
    const slip = computeEmployeeDemoPayslip({
      monthlyBaseSalary: 22_000,
      payFrequency: "monthly",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-01",
      workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      attendanceLogs: [
        {
          date: "2026-12-01",
          clock_in: "2026-12-01T00:00:00Z", // 08:00 PHT
          clock_out: "2026-12-01T07:30:00Z", // 15:30 PHT
        },
      ],
      approvedLeaves: [],
      approvedUndertimes: [
        {
          work_date: "2026-12-01",
          undertime_type: "early_out",
          scheduled_out: "17:00",
          requested_out: "15:30",
          undertime_minutes: 90,
          deduction_mode: "payroll_deduction",
          status: "approved",
        },
      ],
    });

    expect(slip.breakdown.totalApprovedUndertimeMinutes).toBe(90);
    expect(slip.breakdown.undertimeDeduction).toBe(187.5);
    expect(slip.other_deductions).toBe(187.5);
    expect(slip.remarks).toContain("Undertime: 90m (-₱187.50)");
  });
});
