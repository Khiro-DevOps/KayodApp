export interface JobHeadcountInput {
  slots?: number | null;
  onlineHiredCount?: number | null;
  hiredWalkinCount?: number | null;
}

export interface JobHeadcountSummary {
  slots: number;
  onlineHiredCount: number;
  hiredWalkinCount: number;
  totalFilled: number;
  remainingSlots: number;
  isFull: boolean;
  maxWalkinCount: number;
}

export function computeJobHeadcount(input: JobHeadcountInput): JobHeadcountSummary {
  const slots = Math.max(1, Math.floor(Number(input.slots ?? 1) || 1));
  const onlineHiredCount = Math.max(0, Math.floor(Number(input.onlineHiredCount ?? 0) || 0));
  const hiredWalkinCount = Math.max(0, Math.floor(Number(input.hiredWalkinCount ?? 0) || 0));
  const totalFilled = onlineHiredCount + hiredWalkinCount;
  const remainingSlots = Math.max(slots - totalFilled, 0);
  const maxWalkinCount = Math.max(slots - onlineHiredCount, 0);

  return {
    slots,
    onlineHiredCount,
    hiredWalkinCount,
    totalFilled,
    remainingSlots,
    isFull: remainingSlots === 0,
    maxWalkinCount,
  };
}

export function formatHeadcountPillText(summary: JobHeadcountSummary): string {
  return `${summary.totalFilled} / ${summary.slots} Filled • ${summary.onlineHiredCount} Online, ${summary.hiredWalkinCount} Walk-In • ${summary.remainingSlots} Remaining`;
}
