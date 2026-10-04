"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/notifications/notification-bell";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
  badge?: string;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/hr", icon: "dashboard", exact: true },
  { label: "Applicants", href: "/hr/applicants", icon: "layers" },
  { label: "Manage Jobs", href: "/hr/jobs", icon: "work" },
  { label: "Interviews", href: "/hr/interviews", icon: "event" },
  { label: "Offers", href: "/hr/offers", icon: "description" },
  { label: "Employees", href: "/hr/employees", icon: "group" },
  { label: "Applicants", href: "/hr/applicants", icon: "layers" },
  { label: "Manage Jobs", href: "/hr/jobs/manage", icon: "work" },
  { label: "Interviews", href: "/hr/interviews", icon: "video_camera_front" },
  { label: "Schedules", href: "/hr/schedules", icon: "calendar_today" },
  { label: "Attendance", href: "/hr/attendance", icon: "fact_check" },
  { label: "Payroll", href: "/hr/payroll", icon: "payments" },
  { label: "Reports", href: "/hr/reports", icon: "assessment" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [companyName, setCompanyName] = useState("Company");
  const [displayName, setDisplayName] = useState("Admin User");
  const displayRole = "HR Manager"; // Standardized to "HR Manager" everywhere
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [applicantsBadge, setApplicantsBadge] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
    let isMounted = true;

    const loadIdentity = async () => {
      try {
        const { fetchUserOnce } = await import("@/lib/hooks/useAuth");
        const user = await fetchUserOnce();
        if (!isMounted || !user) return;

        const supabase = createClient();

        const { data: profile } = await (supabase
          .from("profiles")
          .select("first_name, last_name, avatar_url, tenant_name, tenant_id, role")
          .eq("id", user.id)
          .maybeSingle() as Promise<{
            data: {
              first_name?: string | null;
              last_name?: string | null;
              avatar_url?: string | null;
              tenant_name?: string | null;
              tenant_id?: string | null;
              role?: string | null;
            } | null;
          }>);

        if (!isMounted || !profile) return;

        const nextName =
          [profile.first_name ?? "", profile.last_name ?? ""].filter(Boolean).join(" ") ||
          "Admin User";
        let nextCompanyName = profile.tenant_name?.trim() || "Company";

        if ((!nextCompanyName || nextCompanyName === "Company") && profile.tenant_id) {
          const { data: company } = await (supabase
            .from("companies")
            .select("name")
            .eq("id", profile.tenant_id)
            .maybeSingle() as Promise<{ data: { name?: string | null } | null }>);

          if (company?.name) {
            nextCompanyName = company.name.trim();
          }
        }

        setCompanyName(nextCompanyName || "Company");
        setDisplayName(nextName);
        setAvatarUrl(profile.avatar_url ?? null);

        // Count pending applications from the canonical job_applications table
        const { count } = await supabase
          .from("job_applications")
          .select("*", { count: "exact", head: true })
          .eq("status", "applied");

        setApplicantsBadge((count ?? 0) > 0 ? String(count) : null);
      } catch (err) {
        setApplicantsBadge(null);
        // swallow
      }
    };

    void loadIdentity();

    return () => {
      isMounted = false;
    };
  }, [pathname]);

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

  return (
    <div className="min-h-screen flex flex-col bg-surface-bg text-text-main">
      {/* Top Navigation Header (Full Width) */}
      <header className="h-[56px] w-full bg-brand-navy text-white flex items-center justify-between px-6 z-20 shrink-0 no-shadow">
        <div className="flex items-center gap-3">
          <Link href="/hr" className="font-bold text-xl text-white tracking-tight hover:opacity-90 transition-opacity">
            Kayod
          </Link>
          <div className="h-4 w-[1px] bg-white/20 mx-1"></div>
          <div className="bg-brand-navy-light text-white/90 px-3 py-1 rounded-md text-xs font-medium border border-white/10 flex items-center gap-1.5">
            <span>{companyName}</span>
            <span className="material-symbols-outlined text-[14px] text-white/60">expand_more</span>
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
                {displayName.trim().split(/\s+/).filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase() || "HR"}
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
                    <Link
                      href="/hr/settings/branches"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg hover:bg-surface-bg text-text-main transition-colors text-left"
                    >
                      <span className="material-symbols-outlined text-[18px] text-text-muted">storefront</span>
                      Office Branches
                    </Link>
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
      <div className="flex flex-1 w-full relative overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-[220px] shrink-0 border-r border-border bg-card-bg flex flex-col justify-between p-4 z-10">
          <nav className="flex-1 space-y-0.5">
            {navItems.map((item) => {
              const active = isActive(item);
              const badge = item.label === "Applicants" ? applicantsBadge : item.badge;

              if (active) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="bg-primary-light text-primary-dark font-semibold rounded-lg my-0.5 flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {badge ? (
                      <span className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
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
                  className="text-text-muted hover:bg-surface-bg hover:text-text-main font-medium rounded-lg my-0.5 flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px] text-text-muted group-hover:text-text-main transition-colors">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {badge ? (
                    <span className="bg-primary-light text-primary-dark text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* Pinned Bottom Items: Support & Settings */}
          <div className="pt-2 border-t border-border space-y-0.5 shrink-0 z-10">
            <Link
              href="/support"
              className="text-text-muted hover:bg-surface-bg hover:text-text-main font-medium rounded-lg flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">contact_support</span>
              <span>Support</span>
            </Link>
            <Link
              href="/hr/settings/branches"
              className="text-text-muted hover:bg-surface-bg hover:text-text-main font-medium rounded-lg flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">storefront</span>
              <span>Office Branches</span>
            </Link>
            <Link
              href="/hr/profile"
              className="text-text-muted hover:bg-surface-bg hover:text-text-main font-medium rounded-lg flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">settings</span>
              <span>Settings</span>
            </Link>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 w-full min-w-0 p-8 overflow-y-auto bg-surface-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
