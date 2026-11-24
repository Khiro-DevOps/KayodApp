"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { getStatusesForStage } from "@/lib/application-stages";
import { getHrJobScope } from "@/lib/hr-job-scope";
import NotificationBell from "@/components/notifications/notification-bell";
import { AmbientCanvas } from "@/components/ui/option-b-surfaces";
import {
  canHr,
  getDefaultHrLandingPath,
  HR_ROLE_LABELS,
  resolveEffectiveHrRole,
  type HrSubRole,
  type Permission,
} from "@/lib/rbac/permissions";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
  badge?: string;
  requiredPermission: Permission;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Core Workspace",
    items: [
      {
        label: "Dashboard",
        href: "/hr",
        icon: "dashboard",
        exact: true,
        requiredPermission: "settings:manage_roles",
      },
      {
        label: "Schedule",
        href: "/hr/schedules",
        icon: "calendar_today",
        requiredPermission: "attendance:view",
      },
      {
        label: "Attendance",
        href: "/hr/attendance",
        icon: "fact_check",
        requiredPermission: "attendance:view",
      },
    ],
  },
  {
    label: "Recruitment & Hiring",
    items: [
      {
        label: "Manage Jobs",
        href: "/hr/jobs",
        icon: "work",
        requiredPermission: "jobs:view",
      },
      {
        label: "Applicants",
        href: "/hr/applicants",
        icon: "layers",
        requiredPermission: "ats:view",
      },
      {
        label: "Interviews",
        href: "/hr/interviews",
        icon: "event",
        requiredPermission: "interviews:conduct",
      },
      {
        label: "Offers",
        href: "/hr/offers",
        icon: "description",
        requiredPermission: "offers:draft",
      },
    ],
  },
  {
    label: "Organization & Payroll",
    items: [
      {
        label: "Employees",
        href: "/hr/employees",
        icon: "group",
        requiredPermission: "workforce:view",
      },
      {
        label: "Office Branches",
        href: "/hr/settings/branches",
        icon: "storefront",
        requiredPermission: "settings:view",
      },
      {
        label: "Payslips",
        href: "/hr/payslips",
        icon: "payments",
        requiredPermission: "payroll:manage",
      },
    ],
  },
];

export interface HrDashboardShellProps {
  children: React.ReactNode;
  initialHrRole: HrSubRole;
  initialIsTenantOwner: boolean;
  initialDisplayName: string;
  initialCompanyName: string;
  initialAvatarUrl: string | null;
}

export default function HrDashboardShell({
  children,
  initialHrRole,
  initialIsTenantOwner,
  initialDisplayName,
  initialCompanyName,
  initialAvatarUrl,
}: HrDashboardShellProps) {
  const pathname = usePathname() ?? "";
  const isInterviewRoom = /^\/hr\/interviews\/[^/]+\/room(?:\/|$)/.test(pathname);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [hrRole, setHrRole] = useState<HrSubRole>(initialHrRole);
  const [isTenantOwner, setIsTenantOwner] = useState(initialIsTenantOwner);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [applicantsBadge, setApplicantsBadge] = useState<string | null>(null);
  const [interviewsBadge, setInterviewsBadge] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useEffect(() => {
    setHrRole(initialHrRole);
    setIsTenantOwner(initialIsTenantOwner);
    setDisplayName(initialDisplayName);
    setCompanyName(initialCompanyName);
    setAvatarUrl(initialAvatarUrl);
  }, [
    initialHrRole,
    initialIsTenantOwner,
    initialDisplayName,
    initialCompanyName,
    initialAvatarUrl,
  ]);

  const effectiveHrRole = resolveEffectiveHrRole(hrRole, isTenantOwner);
  const displayRole = HR_ROLE_LABELS[effectiveHrRole];
  const homeHref = getDefaultHrLandingPath(effectiveHrRole, isTenantOwner);

  const isActive = (item: NavItem) => {
    if (item.exact) {
      return pathname === item.href;
    }

    const unPrefixed = item.href.replace("/hr/", "/");
    return (
      pathname === item.href ||
      pathname.startsWith(`${item.href}/`) ||
      pathname === unPrefixed ||
      pathname.startsWith(`${unPrefixed}/`)
    );
  };

  useEffect(() => {
    if (isInterviewRoom) {
      return;
    }

    let isMounted = true;

    const loadBadges = async () => {
      try {
        const { fetchUserOnce } = await import("@/lib/hooks/useAuth");
        const user = await fetchUserOnce();
        if (!isMounted || !user) return;

        const supabase = createClient();
        const jobScope = await getHrJobScope(supabase, user.id);

        if (canHr(effectiveHrRole, "ats:view", isTenantOwner)) {
          const { data: jobs } = await supabase
            .from("job_postings")
            .select("id")
            .or(jobScope.filter);
          const jobIds = (jobs ?? []).map((job: { id: string }) => job.id);

          if (jobIds.length === 0) {
            setApplicantsBadge(null);
          } else {
            const { count } = await supabase
              .from("job_applications")
              .select("id", { count: "exact", head: true })
              .in("job_id", jobIds)
              .eq("status", "applied");
            if (isMounted) {
              setApplicantsBadge((count ?? 0) > 0 ? String(count) : null);
            }
          }
        } else {
          setApplicantsBadge(null);
        }

        if (
          jobScope.tenantId &&
          canHr(effectiveHrRole, "interviews:conduct", isTenantOwner)
        ) {
          const { data: scheduleRows } = await supabase
            .from("interview_schedules")
            .select(
              "id, job_postings!interview_schedules_job_id_fkey(tenant_id), job_applications!interview_schedules_application_id_fkey(job_postings!job_applications_job_id_fkey(tenant_id))"
            )
            .eq("status", "scheduled")
            .gte("scheduled_at", new Date().toISOString());
          const interviewCount = (scheduleRows ?? []).filter((row: {
            job_postings?: { tenant_id?: string | null } | { tenant_id?: string | null }[] | null;
            job_applications?:
              | {
                  job_postings?: { tenant_id?: string | null } | { tenant_id?: string | null }[] | null;
                }
              | {
                  job_postings?: { tenant_id?: string | null } | { tenant_id?: string | null }[] | null;
                }[]
              | null;
          }) => {
            const directJob = Array.isArray(row.job_postings)
              ? row.job_postings[0]
              : row.job_postings;
            const app = Array.isArray(row.job_applications)
              ? row.job_applications[0]
              : row.job_applications;
            const appJob = Array.isArray(app?.job_postings)
              ? app?.job_postings[0]
              : app?.job_postings;
            const rowTenantId = directJob?.tenant_id ?? appJob?.tenant_id ?? null;
            return rowTenantId === jobScope.tenantId;
          }).length;
          if (isMounted) {
            setInterviewsBadge(interviewCount > 0 ? String(interviewCount) : null);
          }
        } else {
          setInterviewsBadge(null);
        }
      } catch {
        if (isMounted) {
          setApplicantsBadge(null);
          setInterviewsBadge(null);
        }
      }
    };

    void loadBadges();

    return () => {
      isMounted = false;
    };
  }, [isInterviewRoom, pathname, effectiveHrRole, isTenantOwner]);

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
      document.cookie = name.trim() + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    }
    window.location.href = "/login";
  };

  if (isInterviewRoom) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F5FC] text-text-main">
      {/* Top Navigation Header (Full Width) */}
      <header className="h-[56px] w-full bg-[#1E1B4B] text-white flex items-center justify-between px-4 sm:px-6 z-30 shrink-0 no-shadow">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen((prev) => !prev)}
            aria-label={isMobileDrawerOpen ? "Close navigation menu" : "Open navigation menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/90 hover:bg-white/10 lg:hidden"
          >
            <span className="material-symbols-outlined text-[22px]">
              {isMobileDrawerOpen ? "close" : "menu"}
            </span>
          </button>
          <Link href={homeHref} className="font-bold text-xl text-white tracking-tight hover:opacity-90 transition-opacity">
            Kayod
          </Link>
          <div className="h-4 w-[1px] bg-white/20 mx-1"></div>
          <div className="bg-white/10 text-white/90 px-3 py-1 rounded-md text-xs font-medium border border-white/10 flex items-center">
            <span>{companyName}</span>
          </div>
        </div>

        {/* Right Navigation & Profile Area */}
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            type="button"
            className="p-2 text-white/80 hover:bg-white/10 rounded-full transition-colors"
            title="Help"
          >
            <span className="material-symbols-outlined text-[20px]">help</span>
          </button>
          <Link
            href="/hr/profile"
            className="p-2 text-white/80 hover:bg-white/10 rounded-full transition-colors"
            title="Settings"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </Link>

          <div
            className="relative flex items-center gap-2.5 ml-2 pl-4 border-l border-white/20 cursor-pointer"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <div className="text-right mr-1 hidden lg:block">
              <p className="text-xs font-semibold text-white leading-tight">{displayName}</p>
              <p className="text-[10px] text-white/70 font-medium uppercase tracking-wider">{displayRole}</p>
            </div>
            {avatarUrl ? (
              <img
                alt={displayName}
                className="w-8 h-8 rounded-full object-cover border border-white/20"
                src={avatarUrl}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-navy-light text-white border border-white/20 flex items-center justify-center text-xs font-semibold">
                {displayName.trim().split(/\s+/).filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "HR"}
              </div>
            )}

            {/* Dropdown Modal Menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 top-full pt-2 w-56 z-50">
                <div className="rounded-xl border border-border bg-card-bg p-1.5 shadow-xl text-text-main">
                  <div className="px-3 py-2 border-b border-border mb-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{displayRole}</p>
                    <p className="text-[13px] font-semibold text-text-main truncate">{displayName}</p>
                  </div>
                  <div className="space-y-0.5">
                    <Link
                      href="/hr/profile"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg hover:bg-surface-bg text-text-main transition-colors text-left"
                    >
                      <span className="material-symbols-outlined text-[18px] text-text-muted">person</span>
                      My Profile
                    </Link>
                    {canHr(effectiveHrRole, "settings:view", isTenantOwner) ? (
                      <Link
                        href="/hr/settings/branches"
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg hover:bg-surface-bg text-text-main transition-colors text-left"
                      >
                        <span className="material-symbols-outlined text-[18px] text-text-muted">storefront</span>
                        Office Branches
                      </Link>
                    ) : null}
                    <Link
                      href="/hr/profile"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg hover:bg-surface-bg text-text-main transition-colors text-left"
                    >
                      <span className="material-symbols-outlined text-[18px] text-text-muted">domain</span>
                      Workspace Settings
                    </Link>
                  </div>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-semibold rounded-lg hover:bg-error-bg text-error transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Body Shell */}
      <div className="relative flex flex-1 w-full lg:pl-[220px] overflow-hidden">
        {/* Mobile Slide-Over Backdrop */}
        {isMobileDrawerOpen ? (
          <button
            type="button"
            aria-label="Close navigation backdrop"
            onClick={() => setIsMobileDrawerOpen(false)}
            className="fixed inset-0 top-[56px] z-30 bg-[#1E1B4B]/30 backdrop-blur-xs lg:hidden"
          />
        ) : null}

        {/* Left Sidebar (Desktop Frosted Glass Rail + Mobile Slide-Over Drawer) */}
        <aside
          className={`fixed inset-y-0 left-0 top-[56px] z-40 flex w-[240px] flex-col justify-between border-r border-indigo-100/80 bg-white/85 p-4 backdrop-blur-xl transition-transform duration-200 lg:absolute lg:inset-y-0 lg:top-0 lg:z-10 lg:w-[220px] lg:translate-x-0 lg:bg-white/75 ${
            isMobileDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <nav className="flex-1 space-y-0.5 overflow-y-auto">
            {navGroups
              .map((group) => ({
                ...group,
                items: group.items.filter((item) =>
                  canHr(effectiveHrRole, item.requiredPermission, isTenantOwner)
                ),
              }))
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <section key={group.label} className="mt-4 first:mt-0">
                  <h2 className="px-3 mb-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {group.label}
                  </h2>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = isActive(item);
                      const badge =
                        item.label === "Applicants"
                          ? applicantsBadge
                          : item.label === "Interviews"
                            ? interviewsBadge
                            : item.badge;

                      if (active) {
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileDrawerOpen(false)}
                            className="bg-[#EDE9F9] text-[#1E1B4B] font-semibold rounded-xl my-0.5 flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="material-symbols-outlined text-[20px] text-[#1E1B4B]">{item.icon}</span>
                              <span>{item.label}</span>
                            </div>
                            {badge ? (
                              <span className="bg-[#1E1B4B] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                                {badge}
                              </span>
                            ) : null}
                          </Link>
                        );
                      }

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMobileDrawerOpen(false)}
                          className="text-text-muted hover:bg-white/80 hover:text-[#1E1B4B] font-medium rounded-xl my-0.5 flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-[20px] text-text-muted group-hover:text-[#1E1B4B] transition-colors">
                              {item.icon}
                            </span>
                            <span>{item.label}</span>
                          </div>
                          {badge ? (
                            <span className="bg-[#EDE9F9] text-[#1E1B4B] text-[10px] px-2 py-0.5 rounded-full font-bold">
                              {badge}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
          </nav>

          {/* Pinned Bottom Items: Support & Settings */}
          <div className="pt-2 border-t border-indigo-100/80 space-y-0.5 shrink-0 z-10">
            <Link
              href="/support"
              onClick={() => setIsMobileDrawerOpen(false)}
              className="text-text-muted hover:bg-white/80 hover:text-[#1E1B4B] font-medium rounded-xl flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">contact_support</span>
              <span>Support</span>
            </Link>
            <Link
              href="/hr/profile"
              onClick={() => setIsMobileDrawerOpen(false)}
              className="text-text-muted hover:bg-white/80 hover:text-[#1E1B4B] font-medium rounded-xl flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">settings</span>
              <span>Settings</span>
            </Link>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="relative flex-1 w-full min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-[#F6F5FC]">
          <AmbientCanvas />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
