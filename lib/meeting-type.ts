export type MeetingType = "online" | "in_person" | "hybrid";

export function normalizeMeetingType(raw: unknown): MeetingType {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[ -]+/g, "_");

  if (value === "in_person" || value === "inperson") return "in_person";
  if (value === "hybrid" || value === "both") return "hybrid";
  return "online";
}
