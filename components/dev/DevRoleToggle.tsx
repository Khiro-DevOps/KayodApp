"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleDevUserRole } from "@/app/actions/dev-role-toggle";
import { createClient } from "@/lib/supabase/client";
import {
  canHr,
  getDefaultHrLandingPath,
  HR_ROLE_LABELS,
  HR_SUB_ROLES,
  resolveEffectiveHrRole,
  type HrSubRole,
  type Permission,
} from "@/lib/rbac/permissions";

const ROUTE_PERMISSION_GUARDS: Array<{ prefix: string; permission: Permission; exact?: boolean }> = [
  { prefix: "/hr", permission: "settings:manage_roles", exact: true },
  { prefix: "/hr/payroll", permission: "payroll:manage" },
  { prefix: "/hr/payslips", permission: "payroll:manage" },
  { prefix: "/hr/jobs", permission: "jobs:view" },
  { prefix: "/hr/applicants", permission: "ats:view" },
  { prefix: "/hr/interviews", permission: "interviews:conduct" },
  { prefix: "/hr/offers", permission: "offers:draft" },
  { prefix: "/hr/employees", permission: "workforce:view" },
  { prefix: "/hr/attendance", permission: "attendance:view" },
  { prefix: "/hr/schedules", permission: "attendance:view" },
  { prefix: "/hr/leaves", permission: "leaves:view" },
  { prefix: "/hr/settings", permission: "settings:view" },
];

function isCurrentHrRouteAllowed(pathname: string, hrRole: HrSubRole): boolean {
  if (!pathname.startsWith("/hr")) return true;
  const matched = ROUTE_PERMISSION_GUARDS.find((guard) =>
    guard.exact
      ? pathname === guard.prefix
      : pathname === guard.prefix || pathname.startsWith(`${guard.prefix}/`)
  );
  if (!matched) return true;
  return canHr(hrRole, matched.permission);
}

export type DevPrimaryRole = "applicant" | "employee" | "hr_manager";

interface DevRoleToggleProps {
  email?: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function DevRoleToggle({
  email,
  onSuccess,
  onError,
}: DevRoleToggleProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isPending, startTransition] = useTransition();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [activeHrRole, setActiveHrRole] = useState<HrSubRole>("hr_admin");
  const [isTenantOwner, setIsTenantOwner] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadCurrentRole = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted || !user) return;

      setCurrentUserId(user.id);
      const { data: profile } = (await supabase
        .from("profiles")
        .select("role, hr_role, is_tenant_owner")
        .eq("id", user.id)
        .maybeSingle()) as {
        data: {
          role?: string | null;
          hr_role?: string | null;
          is_tenant_owner?: boolean | null;
        } | null;
      };

      if (!mounted || !profile) return;
      setActiveRole(profile.role ?? null);
      setIsTenantOwner(Boolean(profile.is_tenant_owner));
      setActiveHrRole(
        resolveEffectiveHrRole(profile.hr_role, profile.is_tenant_owner)
      );
    };

    void loadCurrentRole();
    return () => {
      mounted = false;
    };
  }, []);

  const handleRoleChange = (targetRole: DevPrimaryRole) => {
    startTransition(async () => {
      const result = await toggleDevUserRole(
        targetRole,
        email?.trim() || undefined,
        targetRole === "hr_manager" ? activeHrRole : undefined
      );

      if (!result.success) {
        const message = result.error ?? "Failed to change account role.";
        onError?.(message);
        toast.error(message);
        return;
      }

      const message =
        result.message ?? `Account role changed to ${targetRole}.`;
      onSuccess?.(message);
      toast.success(message);

      if (result.isCurrentUser) {
        setActiveRole(targetRole === "applicant" ? "candidate" : targetRole);
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {
          // Storage may be unavailable; navigation is still required.
        }

        const destination =
          result.targetRoute ??
          (targetRole === "employee"
            ? "/employee/dashboard"
            : targetRole === "hr_manager"
              ? "/hr"
              : "/applicant/jobs");

        window.location.href = destination;
      }
    });
  };

  const handleSubRoleSwitch = (nextHrRole: HrSubRole) => {
    startTransition(async () => {
      const supabase = createClient();
      let targetUserId = currentUserId;

      const trimmedEmail = email?.trim();
      if (trimmedEmail) {
        const { data: targetProfile, error: lookupError } = (await supabase
          .from("profiles")
          .select("id")
          .eq("email", trimmedEmail)
          .maybeSingle()) as {
          data: { id: string } | null;
          error: { message?: string } | null;
        };

        if (lookupError || !targetProfile?.id) {
          const message =
            lookupError?.message ?? `No profile was found for ${trimmedEmail}.`;
          onError?.(message);
          toast.error(message);
          return;
        }
        targetUserId = targetProfile.id;
      }

      if (!targetUserId) {
        const message = "No authenticated user was found.";
        onError?.(message);
        toast.error(message);
        return;
      }

      const { error } = await supabase.rpc("dev_toggle_user_role", {
        target_user_id: targetUserId,
        new_role: "hr_manager",
        new_hr_role: nextHrRole,
      });

      if (error) {
        const message = error.message || "Failed to switch HR sub-role.";
        onError?.(message);
        toast.error(message);
        return;
      }

      setActiveRole("hr_manager");
      setActiveHrRole(nextHrRole);
      const label = HR_ROLE_LABELS[nextHrRole];
      const message = `HR sub-role switched to ${label}.`;
      onSuccess?.(message);
      toast.success(message);

      if (!isCurrentHrRouteAllowed(pathname, nextHrRole)) {
        router.push(getDefaultHrLandingPath(nextHrRole));
      }
      router.refresh();
    });
  };

  const isHrManagerActive =
    activeRole === "hr_manager" || activeRole === "hr" || activeRole === "admin";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleRoleChange("applicant")}
          className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Switching..." : "Applicant"}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={() => handleRoleChange("employee")}
          className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Switching..." : "Employee"}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={() => handleRoleChange("hr_manager")}
          className="rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Switching..." : "HR Manager"}
        </button>
      </div>

      {isHrManagerActive ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              HR Sub-Role
            </span>
            {isTenantOwner ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                Tenant Owner
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {HR_SUB_ROLES.map((subRole) => {
              const isSelected = activeHrRole === subRole;
              return (
                <button
                  key={subRole}
                  type="button"
                  disabled={isPending}
                  aria-pressed={isSelected}
                  onClick={() => handleSubRoleSwitch(subRole)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSelected
                      ? "border-amber-400 bg-amber-500 text-slate-950"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500/60 hover:bg-slate-800"
                  }`}
                >
                  {HR_ROLE_LABELS[subRole]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
