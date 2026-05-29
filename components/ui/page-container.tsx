"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CircleHelp, Settings2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { effectiveRole, isHRRole, roleLabel } from "@/lib/roles";
import type { UserRole } from "@/lib/types";

import type { ReactNode } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
  badge?: string;
};

const hrNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard", exact: true },
  { label: "Employees", href: "/employees", icon: "group" },
  { label: "Applicants", href: "/applicants", icon: "layers", badge: "12" },
  { label: "Manage Jobs", href: "/jobs/manage", icon: "work" },
  { label: "Payroll", href: "/payroll", icon: "payments" },
  { label: "Reports", href: "/reports", icon: "assessment" },
];

function isHrDesktopRoute(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/employees") ||
    pathname.startsWith("/applicants") ||
    pathname.startsWith("/jobs/manage") ||
    pathname.startsWith("/payroll") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/hr") ||
    pathname.startsWith("/leaves") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/offer-signing")
  );
}

function isActiveNavItem(pathname: string, item: NavItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "A";
}

export default function PageContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [role, setRole] = useState<UserRole | null>(null);
  const [displayName, setDisplayName] = useState("Admin User");
  const [displayRole, setDisplayRole] = useState("HR Manager");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const useHrShell = isHrDesktopRoute(pathname) && isHRRole(role);

  useEffect(() => {
    if (!isHrDesktopRoute(pathname)) {
      return;
    }

    let isMounted = true;
    const supabase = createClient();

    const loadIdentity = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!isMounted || !user) {
        return;
      }

      const rawMetadata = (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {};
      const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, first_name, last_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      const profileRow = profile as {
        role?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        avatar_url?: string | null;
      } | null;

      if (!isMounted) {
        return;
      }

      const nextRole = effectiveRole(profileRow?.role, authRole);
      const nextName = [profileRow?.first_name ?? "", profileRow?.last_name ?? ""].filter(Boolean).join(" ").trim() || "Admin User";

      setRole(nextRole);
      setDisplayName(nextName);
      setDisplayRole(roleLabel(nextRole));
      setAvatarUrl(profileRow?.avatar_url ?? null);
    };

    void loadIdentity();

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  if (!useHrShell) {
    return <div className="mx-auto w-full max-w-[480px] px-4 py-4">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="fixed left-0 top-0 z-50 flex h-[56px] w-full items-center justify-between bg-navbar px-6 shadow-none">
        <div className="flex items-center gap-4">
          <span className="font-(family-name:--font-heading) text-base font-bold tracking-tight text-white">
            Kayod
          </span>
          <div className="h-6 w-px bg-white/20" />
          <span className="text-sm font-medium text-white/80">SG Engineering</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="relative rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" />
          </button>
          <button
            type="button"
            className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Help"
          >
            <CircleHelp className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Settings"
          >
            <Settings2 className="h-5 w-5" />
          </button>

          <div className="ml-1.5 flex items-center gap-3 border-l border-white/20 pl-3">
            <div className="hidden text-right lg:block">
              <p className="text-sm font-medium leading-tight text-white">{displayName}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                {displayRole}
              </p>
            </div>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/10 bg-white/10 bg-cover bg-center text-xs font-bold text-white"
              style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
              aria-label="HR Admin"
              role="img"
            >
              {!avatarUrl ? getInitials(displayName) : null}
            </div>
          </div>
        </div>
      </header>

      <aside className="fixed left-0 top-[56px] z-40 hidden h-[calc(100vh-56px)] w-[220px] flex-col border-r border-card-border bg-surface lg:flex">
        <nav className="flex-1 py-2.5">
          {hrNavItems.map((item) => {
            const active = isActiveNavItem(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mx-2 my-1 flex items-center gap-2 rounded-lg px-4 py-3 transition-colors ${
                  active
                    ? "bg-primary text-white"
                    : "text-text-secondary hover:bg-surface hover:text-text-primary"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span className="text-sm font-medium">{item.label}</span>
                {item.badge ? (
                  <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-navbar">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-card-border p-2.5">
          <Link
            href="/support"
            className="flex items-center gap-2 rounded-lg px-4 py-3 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
          >
            <span className="material-symbols-outlined text-[20px]">contact_support</span>
            <span className="text-sm font-medium">Support</span>
          </Link>
        </div>
      </aside>

      <main className="min-h-screen px-4 pb-6 pt-[56px] lg:ml-[220px] lg:px-6">
        {children}
      </main>
    </div>
  );
}
