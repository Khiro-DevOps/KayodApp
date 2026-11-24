import {
  DAYS_FULL,
  normalizeDaysToFull,
  parseHybridScheduleNotes,
} from "@/lib/hybrid-schedule";

export type ContractWorkSetup = "onsite" | "hybrid" | "wfh" | "remote";
export type DailyWorkModel = "onsite" | "wfh" | "off";

export const GENERIC_ROLE_PLACEHOLDERS = new Set([
  "development employee",
  "team member",
  "unassigned role",
  "employee",
  "staff",
]);

export function normalizeWorkSetup(raw?: string | null): ContractWorkSetup {
  const val = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (val === "hybrid") return "hybrid";
  if (val === "wfh" || val === "work from home") return "wfh";
  if (val === "remote") return "remote";
  return "onsite";
}

export function formatWorkSetupLabel(
  setup: ContractWorkSetup | string | null | undefined,
): "Onsite" | "Hybrid" | "WFH" | "Remote" {
  const normalized = normalizeWorkSetup(setup);
  switch (normalized) {
    case "hybrid":
      return "Hybrid";
    case "wfh":
      return "WFH";
    case "remote":
      return "Remote";
    default:
      return "Onsite";
  }
}

export function formatDailyWorkModelLabel(
  model: DailyWorkModel | string | null | undefined,
): "Onsite" | "WFH" | "Off" {
  const val = String(model ?? "").trim().toLowerCase();
  if (val === "wfh" || val === "remote") return "WFH";
  if (val === "off") return "Off";
  return "Onsite";
}

export function resolveContractWorkSetup({
  offerWorkSetup,
  jobWorkSetup,
  employeeWorkSetup,
}: {
  offerWorkSetup?: string | null;
  jobWorkSetup?: string | null;
  employeeWorkSetup?: string | null;
}): ContractWorkSetup {
  const candidate =
    (offerWorkSetup && offerWorkSetup.trim()) ||
    (jobWorkSetup && jobWorkSetup.trim()) ||
    (employeeWorkSetup && employeeWorkSetup.trim()) ||
    "onsite";
  return normalizeWorkSetup(candidate);
}

export interface ScheduleWorkModelInput {
  mon?: string | null;
  tue?: string | null;
  wed?: string | null;
  thu?: string | null;
  fri?: string | null;
  sat?: string | null;
  sun?: string | null;
  day_modes?: Record<string, string | null | undefined> | null;
  daily_modes?: Record<string, string | null | undefined> | null;
  onsite_days?: string[] | null;
  wfh_days?: string[] | null;
  work_days?: string[] | null;
  notes?: string | null;
}

const WEEKDAY_SHORT_KEYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

const WEEKDAY_FULL_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function getPhtWeekdayIndex(date: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
  });
  const dayName = formatter.format(date).toLowerCase();
  const idx = WEEKDAY_FULL_NAMES.findIndex((d) => d.toLowerCase() === dayName);
  return idx >= 0 ? idx : date.getDay();
}

function normalizeDayAssignment(raw: string | null | undefined): DailyWorkModel | null {
  const val = String(raw ?? "").trim().toLowerCase();
  if (!val) return null;
  if (val === "wfh" || val === "remote") return "wfh";
  if (val === "off" || val === "rest") return "off";
  if (val === "onsite" || val === "on-site" || val === "on_site") return "onsite";
  return null;
}

export function resolveDailyWorkModel({
  contractWorkSetup,
  schedule,
  date = new Date(),
}: {
  contractWorkSetup: ContractWorkSetup | string | null | undefined;
  schedule?: ScheduleWorkModelInput | null;
  date?: Date;
}): DailyWorkModel {
  const setup = normalizeWorkSetup(contractWorkSetup);
  if (setup === "onsite") return "onsite";
  if (setup === "wfh" || setup === "remote") return "wfh";

  if (!schedule) return "onsite";

  const weekdayIdx = getPhtWeekdayIndex(date);
  const shortKey = WEEKDAY_SHORT_KEYS[weekdayIdx];
  const fullName = WEEKDAY_FULL_NAMES[weekdayIdx];
  const fullLower = fullName.toLowerCase();

  // 1. Direct mon..sun keys
  const directVal = normalizeDayAssignment(schedule[shortKey]);
  if (directVal) return directVal;

  // 2. day_modes / daily_modes map
  const modesMap = schedule.day_modes ?? schedule.daily_modes;
  if (modesMap && typeof modesMap === "object") {
    const mapVal = normalizeDayAssignment(
      modesMap[shortKey] ?? modesMap[fullName] ?? modesMap[fullLower],
    );
    if (mapVal) return mapVal;
  }

  // 3. Parsed [HYBRID:ONSITE=...|WFH=...] notes or explicit onsite_days / wfh_days
  const parsed = parseHybridScheduleNotes(schedule.notes);
  const wfhList = normalizeDaysToFull(
    schedule.wfh_days && schedule.wfh_days.length > 0
      ? schedule.wfh_days
      : parsed?.wfhDays,
  ).map((d) => d.toLowerCase());
  const onsiteList = normalizeDaysToFull(
    schedule.onsite_days && schedule.onsite_days.length > 0
      ? schedule.onsite_days
      : parsed?.onsiteDays,
  ).map((d) => d.toLowerCase());

  if (wfhList.includes(fullLower)) return "wfh";
  if (onsiteList.includes(fullLower)) return "onsite";

  // 4. work_days check (if work_days is provided and today is not in it -> off)
  if (Array.isArray(schedule.work_days) && schedule.work_days.length > 0) {
    const workFull = normalizeDaysToFull(schedule.work_days).map((d) =>
      d.toLowerCase(),
    );
    if (!workFull.includes(fullLower)) {
      return "off";
    }
  }

  // Default fallback for hybrid when no explicit day assignment exists
  if (DAYS_FULL.some((d) => d.toLowerCase() === fullLower)) {
    return "onsite";
  }
  return "onsite";
}

export interface ResolveEmployeeSourceInput {
  employee?: {
    position?: string | null;
    job_title?: string | null;
    department?: string | null;
    departments?: { name?: string | null } | Array<{ name?: string | null }> | null;
    work_setup?: string | null;
    work_mode?: string | null;
  } | null;
  offer?: {
    job_title?: string | null;
    work_setup?: string | null;
    work_mode?: string | null;
    department?: string | null;
  } | null;
  jobPosting?: {
    title?: string | null;
    department?: string | null;
    departmentName?: string | null;
    departments?: { name?: string | null } | Array<{ name?: string | null }> | null;
    work_setup?: string | null;
    work_mode?: string | null;
  } | null;
  officeBranch?: {
    name?: string | null;
    address?: string | null;
  } | null;
  remoteResidence?: {
    approval_status?: string | null;
    address?: string | null;
  } | null;
}

export interface ResolvedEmployeeSourceOfTruth {
  position: string;
  department: string;
  workSetup: ContractWorkSetup;
  workSetupLabel: "Onsite" | "Hybrid" | "WFH" | "Remote";
  assignedLocation: string;
}

function extractDeptName(
  depts?: { name?: string | null } | Array<{ name?: string | null }> | null,
): string {
  if (!depts) return "";
  const first = Array.isArray(depts) ? depts[0] : depts;
  return first?.name?.trim() || "";
}

export function resolveEmployeeSourceOfTruth({
  employee,
  offer,
  jobPosting,
  officeBranch,
  remoteResidence,
}: ResolveEmployeeSourceInput): ResolvedEmployeeSourceOfTruth {
  const offerTitle = offer?.job_title?.trim() || "";
  const postingTitle = jobPosting?.title?.trim() || "";
  const empPosRaw = (employee?.position ?? employee?.job_title ?? "").trim();
  const validEmpPos =
    empPosRaw && !GENERIC_ROLE_PLACEHOLDERS.has(empPosRaw.toLowerCase())
      ? empPosRaw
      : "";

  const position =
    offerTitle || postingTitle || validEmpPos || empPosRaw || "Unassigned Role";

  const postingDept =
    jobPosting?.department?.trim() ||
    jobPosting?.departmentName?.trim() ||
    extractDeptName(jobPosting?.departments) ||
    offer?.department?.trim() ||
    "";
  const empJoinedDept = extractDeptName(employee?.departments);
  const empDeptRaw =
    employee?.department?.trim() || empJoinedDept || "";
  const validEmpDept =
    empDeptRaw && empDeptRaw.toLowerCase() !== "general" ? empDeptRaw : "";

  const department = empJoinedDept || validEmpDept || postingDept || empDeptRaw || "General";

  const workSetup = resolveContractWorkSetup({
    offerWorkSetup: offer?.work_setup ?? offer?.work_mode,
    jobWorkSetup: jobPosting?.work_setup ?? jobPosting?.work_mode,
    employeeWorkSetup: employee?.work_setup ?? employee?.work_mode,
  });
  const workSetupLabel = formatWorkSetupLabel(workSetup);

  const branchName = officeBranch?.name?.trim() || "";
  const branchAddress = officeBranch?.address?.trim() || "";
  const approvalStatus = remoteResidence?.approval_status?.trim().toLowerCase() || "";
  const residenceAddress = remoteResidence?.address?.trim() || "";

  let assignedLocation = "To be set";
  if (workSetup === "onsite") {
    assignedLocation = branchName
      ? `${branchName}${branchAddress ? `, ${branchAddress}` : ""}`
      : "To be set";
  } else if (workSetup === "hybrid") {
    const branchLabel = branchName || "Branch To be set";
    const wfhStatus =
      approvalStatus === "approved"
        ? " + WFH Verified"
        : approvalStatus === "pending"
          ? " + WFH Pending"
          : " + WFH To be set";
    assignedLocation = `${branchLabel}${wfhStatus}`;
  } else {
    assignedLocation =
      approvalStatus === "approved"
        ? residenceAddress || "WFH Verified"
        : approvalStatus === "pending"
          ? "Pending HR Approval"
          : "To be set";
  }

  return {
    position,
    department,
    workSetup,
    workSetupLabel,
    assignedLocation,
  };
}
