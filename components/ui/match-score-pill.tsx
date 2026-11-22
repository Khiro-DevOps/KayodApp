import React from "react";

export type MatchScoreTier = "strong" | "good" | "low" | "unscored";

export interface MatchScorePillProps {
  score: number | string | null | undefined;
  /** Optional suffix text after the percentage, defaults to "Match" */
  suffix?: string;
  /** Text displayed when score is null or undefined */
  emptyLabel?: string;
  /** Render nothing when score is null or undefined (defaults to false) */
  hideWhenNull?: boolean;
  /** Optional size preset */
  size?: "xs" | "sm";
  className?: string;
}

export function normalizeMatchScore(
  raw: number | string | null | undefined
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return null;
  const scaled = num > 0 && num <= 1 ? Math.round(num * 100) : Math.round(num);
  return Math.max(0, Math.min(100, scaled));
}

export function getMatchScoreTier(
  score: number | string | null | undefined
): MatchScoreTier {
  const normalized = normalizeMatchScore(score);
  if (normalized === null) return "unscored";
  if (normalized >= 75) return "strong";
  if (normalized >= 50) return "good";
  return "low";
}

export function getMatchScorePillClasses(
  score: number | string | null | undefined
): string {
  const tier = getMatchScoreTier(score);
  switch (tier) {
    case "strong":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "good":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "low":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "unscored":
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function MatchScorePill({
  score,
  suffix = "Match",
  emptyLabel = "—",
  hideWhenNull = false,
  size = "sm",
  className = "",
}: MatchScorePillProps) {
  const normalized = normalizeMatchScore(score);

  if (normalized === null && hideWhenNull) {
    return null;
  }

  const tierClasses = getMatchScorePillClasses(normalized);
  const sizeClasses =
    size === "xs"
      ? "px-2 py-0.5 text-[10px] font-bold"
      : "px-2.5 py-0.5 text-xs font-semibold";

  const label =
    normalized === null
      ? emptyLabel
      : suffix
        ? `${normalized}% ${suffix}`
        : `${normalized}%`;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border whitespace-nowrap ${tierClasses} ${sizeClasses} ${className}`.trim()}
    >
      {label}
    </span>
  );
}

export default MatchScorePill;
