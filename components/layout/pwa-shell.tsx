"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/notifications/notification-bell";

export const pwaShellBackground =
  "min-h-screen w-full bg-[#f7f6fc] text-[#171542] antialiased";

export const pwaAppFrame =
  "flex min-h-screen w-full flex-col bg-[#f7f6fc] md:flex-row";

export const pwaNavBase =
  "fixed inset-x-0 bottom-0 z-50 flex h-16 w-full items-center justify-around border-t border-[#e6e4f0] bg-[#f7f6fc]/95 px-4 backdrop-blur-sm";

export const pwaNavItemBase =
  "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[10px] font-medium transition-all duration-200";

export type PwaVariant = "applicant" | "employee";

export type PwaNavItem = {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
  showBadge?: boolean;
  badge?: string;
};

export type PwaShellConfig = {
  label: string;
  navItems: PwaNavItem[];
};

const defaultPwaShellConfigByVariant: Record<PwaVariant, PwaShellConfig> = {
  applicant: {
    label: "Applicant Portal",
    navItems: [
      { label: "Home", href: "/applicant/dashboard", icon: "home" },
      { label: "Jobs", href: "/applicant/jobs", icon: "work" },
      { label: "Applications", href: "/applicant/applications", icon: "assignment" },
      { label: "Resume", href: "/applicant/resume", icon: "description" },
      { label: "Profile", href: "/applicant/profile", icon: "person" },
    ],
  },
  employee: {
    label: "Employee Portal",
    navItems: [
      { label: "Home", href: "/employee/dashboard", icon: "home" },
      { label: "Schedule", href: "/employee/schedule", icon: "calendar_today" },
      { label: "Leaves", href: "/employee/leaves", icon: "event_note" },
      { label: "Payslips", href: "/employee/payslips", icon: "payments" },
      { label: "Profile", href: "/employee/profile", icon: "person" },
    ],
  },
};

const PwaShellContext = createContext(false);

export function usePwaShellContext() {
  return useContext(PwaShellContext);
}

function isActiveNavItem(pathname: string, item: PwaNavItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function PwaDesktopNav({ variant, navItems }: { variant: PwaVariant; navItems: PwaNavItem[] }) {
  const pathname = usePathname() ?? "";

  return (
    <aside className="hidden w-[220px] shrink-0 border-r border-[#e6e4f0] bg-white md:flex md:flex-col">
      <nav className="flex-1 space-y-1 px-3 py-3">
        {navItems.map((item) => {
          const isActive = isActiveNavItem(pathname, item);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-[#ede9f9] text-[#2d2b68]" : "text-[#5d5a75] hover:bg-[#f7f6fc] hover:text-[#171542]"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function RoleSidebar({
  variant,
  navItems,
}: {
  variant: PwaVariant;
  navItems?: PwaNavItem[];
}) {
  return <PwaDesktopNav variant={variant} navItems={navItems ?? defaultPwaShellConfigByVariant[variant].navItems} />;
}

function PwaMobileNav({ navItems }: { navItems: PwaNavItem[] }) {
  const pathname = usePathname() ?? "";

  return (
    <nav className={`${pwaNavBase} md:hidden`}>
      {navItems.map((item) => {
        const isActive = isActiveNavItem(pathname, item);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${pwaNavItemBase} text-center ${
              isActive ? "bg-[#e9e5ff] text-[#2d2b68]" : "text-[#5d5a75] hover:text-[#2d2b68]"
            }`}
          >
            <span className="relative flex items-center justify-center">
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              {item.showBadge && item.badge ? (
                <span className="absolute -right-2 -top-1 min-w-5 rounded-full border border-[#e6e4f0] bg-[#ef4444] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {item.badge}
                </span>
              ) : null}
            </span>
            <span className="uppercase tracking-[0.08em]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ navItems }: { navItems?: PwaNavItem[] }) {
  return <PwaMobileNav navItems={navItems ?? defaultPwaShellConfigByVariant.applicant.navItems} />;
}

export function PwaSignOutButton() {
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="inline-flex items-center gap-2 rounded-xl border border-danger px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-red-50"
    >
      <span className="material-symbols-outlined text-[18px]">logout</span>
      Sign Out
    </button>
  );
}

function getPageHeader(pathname: string, variant: PwaVariant) {
  const pageHeaders = variant === "employee"
    ? [
        { prefix: "/employee/schedule", title: "My Schedule", description: "Review your upcoming shifts and work schedule." },
        { prefix: "/employee/leaves", title: "Leave Requests", description: "Review and manage your leave requests." },
        { prefix: "/employee/payslips", title: "My Payslips", description: "View and download your pay statements." },
        { prefix: "/employee/profile", title: "My Profile", description: "Keep your personal details up to date." },
        { prefix: "/employee/dashboard", title: "Employee Dashboard", description: "Review schedules, leave requests, payslips, and daily work updates." },
      ]
    : [
        { prefix: "/applicant/jobs", title: "Browse Jobs", description: "Explore open roles and find your next opportunity." },
        { prefix: "/applicant/applications", title: "My Applications", description: "Track your applications and interview progress." },
        { prefix: "/applicant/interviews", title: "My Interviews", description: "Review upcoming and completed interviews." },
        { prefix: "/applicant/resume", title: "Resume", description: "Manage the resumes you use for applications." },
        { prefix: "/applicant/profile", title: "My Profile", description: "Keep your personal details up to date." },
        { prefix: "/applicant/dashboard", title: "Applicant Dashboard", description: "Track jobs, applications, interviews, and your resume from one place." },
      ];

  return pageHeaders.find((page) => pathname === page.prefix || pathname.startsWith(`${page.prefix}/`)) ?? {
    title: variant === "employee" ? "Employee Portal" : "Applicant Portal",
    description: "Manage your Kayod account.",
  };
}

export default function PwaShell({
  variant,
  config,
  children,
}: {
  variant: PwaVariant;
  config?: PwaShellConfig;
  children: ReactNode;
}) {
  const resolvedConfig = config ?? defaultPwaShellConfigByVariant[variant];
  const pathname = usePathname() ?? "";
  const pageHeader = getPageHeader(pathname, variant);
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    if (variant !== "employee") return;
    let isMounted = true;
    const supabase = createClient();
    async function loadTenant() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const metaCompany =
          user.user_metadata?.company_name ||
          user.user_metadata?.tenant_name ||
          user.app_metadata?.company_name ||
          user.app_metadata?.tenant_name;

        if (metaCompany && isMounted) {
          setCompanyName(metaCompany);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id, tenants(name)")
          .eq("id", user.id)
          .maybeSingle();

        const typedProfile = profile as { tenant_id: string | null; tenants: { name: string } | null } | null;

        if (typedProfile?.tenants?.name && isMounted) {
          setCompanyName(typedProfile.tenants.name);
          return;
        }

        if (profile?.tenant_id && isMounted) {
          const { data: tenant } = await supabase
            .from("tenants")
            .select("name")
            .eq("id", profile.tenant_id)
            .maybeSingle();
          if (tenant?.name && isMounted) {
            setCompanyName(tenant.name);
          }
        }
      } catch {
        // Fallback gracefully
      }
    }
    void loadTenant();
    return () => {
      isMounted = false;
    };
  }, [variant]);

  return (
    <PwaShellContext.Provider value>
      <div className={pwaShellBackground} data-pwa-shell={variant}>
        {/* HEADER: #1F195E (Deep Navy) background, unified top bar for mobile & desktop */}
        <header className="fixed inset-x-0 top-0 z-50 flex min-h-[72px] items-center justify-between gap-6 bg-[#1F195E] px-6 py-3 text-white shadow-[0_8px_20px_rgba(31,25,94,0.18)]">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={variant === "employee" ? "/employee/dashboard" : "/applicant/dashboard"} className="shrink-0 text-xl font-bold tracking-tight text-white transition-opacity hover:opacity-90">
              Kayod
            </Link>
            <div className="h-4 w-px shrink-0 bg-white/20" />
            <div className="flex min-w-0 items-center rounded-md border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              <span className="truncate">
                {variant === "employee"
                  ? companyName
                    ? `${companyName} Employee Portal`
                    : "Employee Portal"
                  : resolvedConfig.label}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1 px-3">
            {variant === "employee" ? null : (
              <>
                <p className="truncate text-sm font-semibold text-white">{pageHeader.title}</p>
                <p className="hidden truncate text-[11px] text-white/65 sm:block">{pageHeader.description}</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-bold text-[#1F195E]">
              JG
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Link
                href={variant === "employee" ? "/employee/profile" : "/applicant/profile"}
                className="p-2 text-white/80 hover:bg-white/10 rounded-full transition-colors"
                title="Settings"
              >
                <span className="material-symbols-outlined text-[20px]">settings</span>
              </Link>
              <PwaSignOutButton />
            </div>
          </div>
        </header>

        <div className={`${pwaAppFrame} pt-[72px]`}>
          <PwaDesktopNav variant={variant} navItems={resolvedConfig.navItems} />

          <div className="flex min-w-0 flex-1 flex-col px-6 py-6 md:px-8 md:py-8">
            <main className="flex-1 w-full min-w-0 bg-[#f7f6fc] pb-24 pt-2 md:pb-6 md:pt-2">{children}</main>
            <PwaMobileNav navItems={resolvedConfig.navItems} />
          </div>
        </div>
      </div>
    </PwaShellContext.Provider>
  );
}