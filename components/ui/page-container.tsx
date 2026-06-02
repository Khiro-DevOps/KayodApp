"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { effectiveRole, isHRRole, roleLabel } from "@/lib/roles";
import type { UserRole } from "@/lib/types";
import DashboardHeader from "@/components/ui/dashboard-header";
import PwaShell from "@/components/layout/pwa-shell";
import DashboardLayout from "@/app/(dashboard)/hr/layout";

import type { ReactNode } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
  badge?: string;
};

const hrNavItems: NavItem[] = [
  { label: "Dashboard", href: "/hr", icon: "dashboard", exact: true },
  { label: "Applicants", href: "/hr/applicants", icon: "layers" },
  { label: "Manage Jobs", href: "/hr/jobs", icon: "work" },
  { label: "Interviews", href: "/hr/interviews", icon: "event" },
  { label: "Offers", href: "/hr/offers", icon: "description" },
  { label: "Employees", href: "/hr/employees", icon: "group" },
  { label: "Payroll", href: "/hr/payroll", icon: "payments" },
  { label: "Reports", href: "/hr/reports", icon: "assessment" },
];

function isHrDesktopRoute(pathname: string) {
  return (
    pathname === "/hr" ||
    pathname.startsWith("/hr/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/applications") ||
    pathname.startsWith("/employees") ||
    pathname.startsWith("/applicants") ||
    pathname.startsWith("/jobs/manage") ||
    pathname.startsWith("/payroll") ||
    pathname.startsWith("/reports") ||
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

export default function PageContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isApplicantRoute = pathname.startsWith("/applicant");
  const isEmployeeRoute = pathname.startsWith("/employee");
  const isHrDashboardRoute = pathname === "/hr";
  const [role, setRole] = useState<UserRole | null>(null);
  const [, setTenantId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Admin User");
  const [displayRole, setDisplayRole] = useState("HR Manager");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("Company");
  const [applicantsBadge, setApplicantsBadge] = useState<string | null>(null);

  const useHrShell = isHrDesktopRoute(pathname) && isHRRole(role);

  useEffect(() => {
    if (!isHrDesktopRoute(pathname)) {
      return;
    }

    let isMounted = true;

    const loadIdentity = async () => {
      try {
        const { fetchUserOnce } = await import("@/lib/hooks/useAuth");
        const user = await fetchUserOnce();

        if (!isMounted || !user) return;

        const rawMetadata = (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {};
        const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

        const supabase = createClient();

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, tenant_id, first_name, last_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        const profileRow = profile as {
          role?: string | null;
          tenant_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
        } | null;

        if (!isMounted) {
          return;
        }

        const nextRole = effectiveRole(profileRow?.role, authRole);
        const nextName = [profileRow?.first_name ?? "", profileRow?.last_name ?? ""].filter(Boolean).join(" ").trim() || "Admin User";
        const nextTenantId = profileRow?.tenant_id?.trim() ?? null;
        let nextCompanyName = "Company";

        if (nextTenantId) {
          const { data: company } = await supabase
            .from("companies")
            .select("name")
            .eq("id", nextTenantId)
            .maybeSingle() as unknown as { data: { name?: string | null } | null; error: any };

          nextCompanyName = company?.name?.trim() || nextCompanyName;
        }

        setRole(nextRole);
        setTenantId(nextTenantId);
        setDisplayName(nextName);
        setDisplayRole(roleLabel(nextRole));
        setAvatarUrl(profileRow?.avatar_url ?? null);
        setCompanyName(nextCompanyName);

        if (nextTenantId) {
          try {
            const { count } = await supabase
              .from("applications")
              .select("id", { count: "exact", head: true })
              .eq("job_postings.tenant_id", nextTenantId);

            setApplicantsBadge((count ?? 0) > 0 ? String(count) : null);
          } catch {
            setApplicantsBadge(null);
          }
        }
      } catch (err) {
        console.error("loadIdentity error:", err);
      }
    };

    void loadIdentity();

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  if (isApplicantRoute || isEmployeeRoute) {
    return <PwaShell variant={isApplicantRoute ? "applicant" : "employee"}>{children}</PwaShell>;
  }

  if (useHrShell) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  return <div className="mx-auto w-full max-w-[480px] px-4 py-4">{children}</div>;
}
