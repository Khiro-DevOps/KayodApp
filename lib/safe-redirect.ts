import { normalizeRole } from "@/lib/roles";

export function getRoleHome(role?: string | null): string {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case "hr_manager":
    case "admin":
      return "/hr";
    case "employee":
      return "/employee/dashboard";
    case "candidate":
    default:
      return "/applicant/dashboard";
  }
}

function isProtectedForRole(pathname: string, role?: string | null): boolean {
  const rawRole = String(role ?? "").trim().toLowerCase();
  const normalized = normalizeRole(role);

  const isHr =
    rawRole === "hr" ||
    normalized === "hr_manager" ||
    normalized === "admin";
  const isEmployee = normalized === "employee";
  const isCandidate = normalized === "candidate";

  if (pathname === "/hr" || pathname.startsWith("/hr/")) {
    return !isHr;
  }
  if (pathname === "/employee" || pathname.startsWith("/employee/")) {
    return !isEmployee;
  }
  if (pathname === "/applicant" || pathname.startsWith("/applicant/")) {
    return !isCandidate;
  }

  return false;
}

export function safeNext(value?: string | null, role?: string | null): string {
  const fallback = getRoleHome(role);
  if (typeof value !== "string") return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("//") || trimmed.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return fallback;

  const pathPart = trimmed.split(/[?#]/)[0] ?? "";
  if (!pathPart || pathPart.includes(":")) return fallback;

  if (isProtectedForRole(pathPart, role)) {
    return fallback;
  }

  return trimmed;
}
