import type { UserRole } from "@/lib/types";

const ROLE_MAP: Record<string, UserRole | null> = {
  candidate: "candidate",
  job_seeker: "candidate",
  employee: "employee",
  hr_manager: "hr_manager",
  admin: "admin",
};

export function normalizeRole(value?: string | null): UserRole | null {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return ROLE_MAP[normalized] ?? null;
}

export function effectiveRole(profileRole?: string | null, authRole?: string | null): UserRole {
  // Profile role takes priority — it's the source of truth after sign-up
  return normalizeRole(profileRole) ?? normalizeRole(authRole) ?? "candidate";
}

export function isHRRole(value?: string | null): boolean {
  const role = normalizeRole(value);
  return role === "hr_manager" || role === "admin";
}

export function isCandidateRole(value?: string | null): boolean {
  return normalizeRole(value) === "candidate";
}

export function roleLabel(value?: string | null): string {
  const role = normalizeRole(value);
  switch (role) {
    case "hr_manager":
      return "HR Manager";
    case "employee":
      return "Employee";
    case "candidate":
      return "Job Seeker";
    case "admin":
      return "Admin";
    default:
      return "Unknown";
  }
}