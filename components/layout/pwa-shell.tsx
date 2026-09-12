"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export const pwaShellBackground =
  "min-h-screen w-full bg-[#f7f6fc] text-[#171542] antialiased";

export const pwaAppFrame =
  "mx-auto flex min-h-screen w-full max-w-[1280px] flex-col bg-[#f7f6fc] md:flex-row";

export const pwaHeaderBase =
  "sticky top-0 z-30 border-b border-[#e6e4f0] bg-[#2d2b68] px-4 pb-4 pt-5 text-white shadow-[0_8px_20px_rgba(39,36,84,0.18)]";

export const pwaNavBase =
  "fixed inset-x-0 bottom-0 z-50 mx-auto flex h-16 w-full max-w-[480px] items-center justify-around border-t border-[#e6e4f0] bg-[#f7f6fc]/95 px-3 backdrop-blur-sm";

export const pwaNavItemBase =
  "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[10px] font-medium transition-all duration-200";

type PwaVariant = "applicant" | "employee";

type PwaNavItem = {
  label: string;
  href: string;
  icon: string;
};

const navItemsByVariant: Record<PwaVariant, PwaNavItem[]> = {
  applicant: [
    { label: "Home", href: "/applicant/dashboard", icon: "home" },
    { label: "Jobs", href: "/applicant/jobs", icon: "work" },
    { label: "Applications", href: "/applicant/applications", icon: "assignment" },
    { label: "Resume", href: "/applicant/resume", icon: "description" },
    { label: "Profile", href: "/applicant/profile", icon: "person" },
  ],
  employee: [
    { label: "Home", href: "/employee/dashboard", icon: "home" },
    { label: "Schedule", href: "/employee/schedules", icon: "calendar_today" },
    { label: "Leaves", href: "/employee/leaves", icon: "event_note" },
    { label: "Profile", href: "/employee/profile", icon: "person" },
  ],
};

export function RoleSidebar({ variant }: { variant: PwaVariant }) {
  const pathname = usePathname() ?? "";
  const navItems = navItemsByVariant[variant];

  return (
    <aside className="hidden w-[220px] shrink-0 border-r border-[#e6e4f0] bg-white md:flex md:flex-col">
      <div className="flex items-center gap-3 border-b border-[#e6e4f0] px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e9e5ff] text-[#2d2b68]">
          <span className="material-symbols-outlined text-[20px]">person</span>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#6b688d]">
            {variant === "applicant" ? "Applicant Portal" : "Employee Portal"}
          </p>
          <p className="text-sm font-semibold text-[#171542]">Kayod</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

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

const shellConfig: Record<
  PwaVariant,
  {
    label: string;
    title: string;
    description: string;
    actionLabel: string;
    actionHref: string;
    actionIcon: string;
    accentClass: string;
  }
> = {
  applicant: {
    label: "Applicant Portal",
    title: "Applicant Dashboard",
    description: "Track jobs, applications, interviews, and your resume from one place.",
    actionLabel: "Browse Jobs",
    actionHref: "/applicant/jobs",
    actionIcon: "search",
    accentClass: "bg-[#7C7AAC] hover:bg-[#4A4880]",
  },
  employee: {
    label: "Employee Portal",
    title: "Employee Dashboard",
    description: "Review schedules, leave requests, and daily work updates from a dedicated space.",
    actionLabel: "View Schedule",
    actionHref: "/employee/schedules",
    actionIcon: "event_available",
    accentClass: "bg-[#7C7AAC] hover:bg-[#4A4880]",
  },
};

export default function PwaShell({
  variant,
  children,
}: {
  variant: PwaVariant;
  children: ReactNode;
}) {
  const config = shellConfig[variant];
  const navItems = navItemsByVariant[variant];

  return (
    <div className={pwaShellBackground}>
      <div className={pwaAppFrame}>
        <RoleSidebar variant={variant} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className={pwaHeaderBase}>
            <div className="mx-auto flex w-full max-w-[960px] items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#cfcaf8]">
                  {config.label}
                </p>
                <h1 className="text-[22px] font-semibold leading-8 text-white">
                  {config.title}
                </h1>
                <p className="max-w-[260px] text-[13px] leading-[20px] text-[#ece9ff]">
                  {config.description}
                </p>
              </div>

              <Link
                href={config.actionHref}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors ${config.accentClass}`}
              >
                <span className="material-symbols-outlined text-[18px]">{config.actionIcon}</span>
                {config.actionLabel}
              </Link>
            </div>
          </header>

          <div className="flex-1 bg-[#f7f6fc]">{children}</div>
        </div>
      </div>
    </div>
  );
}