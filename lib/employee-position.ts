export const GENERIC_POSITION_PLACEHOLDERS = new Set([
  "development employee",
  "team member",
  "employee",
  "staff",
]);

export interface ResolveEmployeePositionParams {
  employeePosition?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  jobDepartment?: string | null;
}

export interface ResolvedEmployeePosition {
  position: string;
  department: string;
}

/**
 * Resolves the canonical employee position and department, prioritizing
 * the linked job posting over generic placeholder values.
 */
export function resolveEmployeePosition({
  employeePosition,
  jobTitle,
  department,
  jobDepartment,
}: ResolveEmployeePositionParams): ResolvedEmployeePosition {
  const trimmedJobTitle = jobTitle?.trim() || "";
  const trimmedEmployeePosition = employeePosition?.trim() || "";
  const isPlaceholder =
    !trimmedEmployeePosition ||
    GENERIC_POSITION_PLACEHOLDERS.has(trimmedEmployeePosition.toLowerCase());

  const position =
    trimmedJobTitle ||
    (!isPlaceholder ? trimmedEmployeePosition : "Unassigned Role");

  const trimmedJobDepartment = jobDepartment?.trim() || "";
  const trimmedDepartment = department?.trim() || "";
  const resolvedDepartment =
    trimmedJobDepartment ||
    (trimmedDepartment && trimmedDepartment.toLowerCase() !== "general"
      ? trimmedDepartment
      : "") ||
    trimmedDepartment ||
    "General";

  return {
    position,
    department: resolvedDepartment,
  };
}
