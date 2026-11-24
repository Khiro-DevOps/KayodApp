import { describe, expect, it } from "vitest";
import { computeEmployeeDemoPayslip } from "@/lib/payroll-calculator";

describe("Philippine Labor Code & BIR TRAIN Payroll Calculator", () => {
  it("computes entry-level employee (₱18,000/mo) with 0 tax and exact SSS/PhilHealth/Pag-IBIG", () => {
    const slip = computeEmployeeDemoPayslip({
      monthlyBaseSalary: 18_000,
      payFrequency: "monthly",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-01",
      workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      attendanceLogs: [
        {
          date: "2026-12-01",
          clock_in: "2026-12-01T00:00:00Z", // 08:00 PHT
          clock_out: "2026-12-01T09:00:00Z", // 17:00 PHT
        },
      ],
      approvedLeaves: [],
    });

    expect(slip.basic_pay).toBe(18_000);
    // SSS: 5% of ₱18,000 MSC = ₱900.00
    expect(slip.sss_contribution).toBe(900);
    // PhilHealth: 2.5% of ₱18,000 = ₱450.00
    expect(slip.philhealth_contrib).toBe(450);
    // Pag-IBIG: ₱200.00
    expect(slip.pagibig_contrib).toBe(200);
    // Taxable = 18,000 - 1,550 = ₱16,450 <= ₱20,833.33 -> 0 tax
    expect(slip.withholding_tax).toBe(0);
    expect(slip.total_deductions).toBe(1_550);
    expect(slip.net_pay).toBe(16_450);
  });

  it("caps PhilHealth at ₱2,500, SSS at ₱1,750, Pag-IBIG at ₱200, shields de minimis, and applies BIR TRAIN tax for ₱120,000/mo", () => {
    const slip = computeEmployeeDemoPayslip({
      monthlyBaseSalary: 120_000,
      payFrequency: "monthly",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-01",
      workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      attendanceLogs: [
        {
          date: "2026-12-01",
          clock_in: "2026-12-01T00:00:00Z",
          clock_out: "2026-12-01T09:00:00Z",
        },
      ],
      approvedLeaves: [],
      contractAllowances: [
        { label: "Rice Subsidy", amount: 2_000 },
        { label: "Uniform / Clothing Allowance", amount: 500 },
        { label: "Medical Allowance", amount: 833.33 },
      ],
    });

    expect(slip.sss_contribution).toBe(1_750);
    expect(slip.philhealth_contrib).toBe(2_500);
    expect(slip.pagibig_contrib).toBe(200);
    expect(slip.breakdown.deMinimisExemptAmount).toBe(3_333.33);
    // Taxable = (120,000 + 3,333.33) - 3,333.33 - 1,750 - 2,500 - 200 = 115,550
    expect(slip.breakdown.taxableIncome).toBe(115_550);
    // BIR TRAIN: 8,541.80 + (115,550 - 66,667) * 0.25 = 20,762.55
    expect(slip.withholding_tax).toBe(20_762.55);
  });

  it("scales semi-monthly cutoff (1st-15th) basic pay, statutory caps, and BIR TRAIN brackets by 0.5", () => {
    const slip = computeEmployeeDemoPayslip({
      monthlyBaseSalary: 40_000,
      payFrequency: "semi_monthly",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-01",
      workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      attendanceLogs: [
        {
          date: "2026-12-01",
          clock_in: "2026-12-01T00:00:00Z",
          clock_out: "2026-12-01T09:00:00Z",
        },
      ],
      approvedLeaves: [],
    });

    expect(slip.basic_pay).toBe(20_000);
    // SSS MSC capped at 35k -> 1,750/mo -> 875/cutoff
    expect(slip.sss_contribution).toBe(875);
    // PhilHealth 2.5% of 40k = 1,000/mo -> 500/cutoff
    expect(slip.philhealth_contrib).toBe(500);
    // Pag-IBIG 200/mo -> 100/cutoff
    expect(slip.pagibig_contrib).toBe(100);
    // Taxable = 20,000 - 1,475 = 18,525 (monthly eq 37,050)
    // Monthly tax = 1,875 + (37,050 - 33,333)*0.20 = 2,618.40 -> cutoff = 1,309.20
    expect(slip.withholding_tax).toBe(1_309.2);
  });

  it("computes graveyard shift (20:00-05:00) NSD, Regular OT (1.25x), RDOT (1.30x/1.69x), and counts approved paid VL/SL as non-absent", () => {
    // 22,000/mo -> dailyRate = 1,000 -> hourlyRate = 125
    const slip = computeEmployeeDemoPayslip({
      monthlyBaseSalary: 22_000,
      payFrequency: "monthly",
      periodStart: "2026-12-01", // Tue (worked 20:00-05:00 + 2h Regular OT 05:00-07:00)
      periodEnd: "2026-12-05",   // Wed-Fri covered by approved VL/SL, Sat RDOT 9h (08:00-17:00? 9h = 08:00-17:00 is 9h!)
      shiftStart: "20:00",
      shiftEnd: "05:00",
      workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      attendanceLogs: [
        {
          date: "2026-12-01",
          clock_in: "2026-12-01T12:15:00Z", // 20:15 PHT (15m late)
          clock_out: "2026-12-01T23:00:00Z", // 07:00 PHT (+2h OT past 05:00)
          late_minutes: 15,
          night_diff_minutes: 420, // 22:00-05:00 = 7h
          total_lunch_minutes: 60,
        },
      ],
      approvedLeaves: [
        {
          start_date: "2026-12-02",
          end_date: "2026-12-04",
          status: "approved",
          leave_type: "vacation",
        },
      ],
      approvedOvertimes: [
        {
          work_date: "2026-12-05",
          start_time: "08:00",
          end_time: "17:00", // 9h on rest day -> 8h @ 1.30x + 1h @ 1.69x
          overtime_type: "rdot",
        },
      ],
    });

    // Approved VL covers Wed-Fri -> 0 unexcused absences
    expect(slip.breakdown.unexcusedAbsentDays).toBe(0);
    expect(slip.breakdown.absenceDeduction).toBe(0);
    expect(slip.breakdown.totalLateMinutes).toBe(15);
    expect(slip.breakdown.lateDeduction).toBe(31.25);

    // Regular OT: 15m late offsets 15m of post-shift time -> 105m (1.75h) net OT past 8h
    // 1.75h * 125 * 1.25 = 273.44
    expect(slip.breakdown.regularOtMinutes).toBe(105);
    expect(slip.breakdown.regularOtPay).toBe(273.44);

    // RDOT: 8h * 125 * 1.30 (1300) + 1h * 125 * 1.69 (211.25) = 1511.25
    expect(slip.breakdown.rdotRegularMinutes).toBe(480);
    expect(slip.breakdown.rdotExcessMinutes).toBe(60);
    expect(slip.breakdown.rdotPay).toBe(1511.25);
    expect(slip.overtime_pay).toBe(1784.69);

    // NSD: 7h * 125 * 0.10 = 87.50
    expect(slip.breakdown.nightDiffHours).toBe(7);
    expect(slip.breakdown.nightDiffPay).toBe(87.5);
  });
});
