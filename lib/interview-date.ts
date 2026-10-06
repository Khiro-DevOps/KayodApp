const TIME_ZONE = "Asia/Manila";

function dateKey(dateValue: string | Date | null | undefined) {
  if (!dateValue) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateValue));
}

export function getPhtDateGroup(dateValue: string | Date | null | undefined, now = new Date()) {
  const key = dateKey(dateValue);
  if (!key) return "Unscheduled";
  const today = dateKey(now);
  const tomorrow = dateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, weekday: "long", month: "short", day: "numeric" }).format(new Date(String(dateValue)));
}

export function formatPhtDateTime(dateValue: string | Date | null | undefined) {
  return dateValue
    ? new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(dateValue))
    : "Time to be confirmed";
}
