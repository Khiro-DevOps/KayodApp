import { describe, expect, it } from "vitest";
import { computeJobHeadcount, formatHeadcountPillText } from "./job-headcount";

describe("computeJobHeadcount", () => {
  it("computes remaining slots and max walk-in count accurately", () => {
    const summary = computeJobHeadcount({
      slots: 5,
      onlineHiredCount: 1,
      hiredWalkinCount: 1,
    });

    expect(summary).toEqual({
      slots: 5,
      onlineHiredCount: 1,
      hiredWalkinCount: 1,
      totalFilled: 2,
      remainingSlots: 3,
      isFull: false,
      maxWalkinCount: 4,
    });
    expect(formatHeadcountPillText(summary)).toBe(
      "2 / 5 Filled • 1 Online, 1 Walk-In • 3 Remaining",
    );
  });

  it("marks job as full when online + walk-in reaches slots", () => {
    const summary = computeJobHeadcount({
      slots: 3,
      onlineHiredCount: 2,
      hiredWalkinCount: 1,
    });

    expect(summary.remainingSlots).toBe(0);
    expect(summary.isFull).toBe(true);
    expect(summary.maxWalkinCount).toBe(1);
  });

  it("clamps remainingSlots at 0 if filled exceeds slots and defaults slots to 1", () => {
    const summary = computeJobHeadcount({
      slots: null,
      onlineHiredCount: 2,
      hiredWalkinCount: -3,
    });

    expect(summary.slots).toBe(1);
    expect(summary.hiredWalkinCount).toBe(0);
    expect(summary.remainingSlots).toBe(0);
    expect(summary.isFull).toBe(true);
    expect(summary.maxWalkinCount).toBe(0);
  });
});
