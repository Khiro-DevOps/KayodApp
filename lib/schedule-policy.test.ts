import { describe, expect, it } from "vitest";
import {
  buildWorkScheduleSummary,
  normalizeRestDaysPolicy,
  normalizeScheduleType,
  normalizeShiftRotationPattern,
  resolveDefaultWorkDaysForCount,
  resolveInitialHireSchedule,
} from "./schedule-policy";
import { buildOfferPrefillFields } from "./docuseal";

describe("schedule-policy helpers", () => {
  it("builds a clear rotating schedule summary", () => {
    const summary = buildWorkScheduleSummary({
      scheduleType: "rotating",
      workDaysPerWeek: 5,
      restDaysPolicy: "rotating_rest_days",
      shiftRotationPattern: "weekly_rotation",
      shiftStart: "08:00",
      shiftEnd: "17:00",
    });

    expect(summary).toBe(
      "Rotating / Shifting Schedule • Weekly Rotation (Morning / Mid / Graveyard) • 5 Work Days/Week (Rotating Rest Days) • Initial Shift: 08:00 AM – 05:00 PM",
    );
  });

  it("normalizes legacy and new schedule policy values", () => {
    expect(normalizeScheduleType("flexible")).toBe("rotating");
    expect(normalizeScheduleType("fixed")).toBe("fixed");
    expect(normalizeRestDaysPolicy("flexible", "rotating")).toBe(
      "flexible_split_rest_days",
    );
    expect(normalizeShiftRotationPattern("biweekly", "rotating")).toBe(
      "biweekly_custom_rotation",
    );
    expect(resolveDefaultWorkDaysForCount(6)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("derives initial hire schedule from rotating offer metadata", () => {
    const schedule = resolveInitialHireSchedule({
      offer: {
        shift_start: "22:00",
        shift_end: "07:00",
        work_days: null,
        job_metadata: {
          schedule_type: "rotating",
          work_days_per_week: 5,
          rest_days_policy: "rotating_rest_days",
          shift_rotation_pattern: "weekly_rotation",
        },
      },
    });

    expect(schedule.scheduleType).toBe("rotating");
    expect(schedule.shiftStart).toBe("22:00");
    expect(schedule.shiftEnd).toBe("07:00");
    expect(schedule.workDays).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("maps rotating schedule fields into DocuSeal prefill payload", () => {
    const prefill = buildOfferPrefillFields(
      {
        salary: 35000,
        shift_start: "08:00",
        shift_end: "17:00",
        job_metadata: {
          schedule_type: "rotating",
          work_days_per_week: 5,
          rest_days_policy: "rotating_rest_days",
          shift_rotation_pattern: "weekly_rotation",
        },
      },
      {
        title: "Operations Associate",
        company_name: "Kayod Corp",
      },
      {
        first_name: "Juan",
        last_name: "Dela Cruz",
      },
    );

    expect(prefill.schedule_type).toBe("Rotating / Shifting Schedule");
    expect(prefill.shift_rotation_pattern).toBe(
      "Weekly Rotation (Morning / Mid / Graveyard)",
    );
    expect(prefill.work_days_per_week).toBe("5 Work Days / Week");
    expect(prefill.rest_days_policy).toBe("Rotating Rest Days");
    expect(prefill.shift_hours).toBe("08:00 AM – 05:00 PM PHT");
    expect(prefill.work_schedule_summary).toContain("Rotating / Shifting Schedule");
  });

  it("formats employment_type in Title Case and never leaks a raw UUID in work_location", () => {
    const prefill = buildOfferPrefillFields(
      {
        salary: 40000,
        work_setup: "onsite",
      },
      {
        title: "Store Supervisor",
        company_name: "Kayod Corp",
        employment_type: "full_time",
        location: "9f23a7b4-1234-4abc-8def-0123456789ab",
      },
      {
        first_name: "Maria",
        last_name: "Santos",
      },
      {
        name: "Looc Branch",
        address: "123 Rizal St, Calamba, Laguna",
      },
    );

    expect(prefill.employment_type).toBe("Full-Time");
    expect(prefill.work_location).toBe("Looc Branch — 123 Rizal St, Calamba, Laguna");
    expect(prefill.leave_credits).toContain("SIL / year");
  });
});
