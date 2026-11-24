import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";

import PwaShell from "@/components/layout/pwa-shell";

export default async function EmployeeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <>{children}</>;
  }

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name, tenant_id")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "role" | "first_name" | "last_name" | "tenant_id">>();

  let role = effectiveRole(profile?.role, authRole);

  if (role === "hr_manager" || role === "admin") {
    redirect("/hr");
  }

  // Activation safety net: promote applicant/candidate with an active employee record
  if (String(role) === "applicant" || role === "candidate") {
    try {
      const admin = getAdminClient();
      const { data: activeEmployee } = await admin
        .from("employees")
        .select("id")
        .eq("profile_id", user.id)
        .eq("employment_status", "active")
        .maybeSingle();

      if (activeEmployee) {
        await admin
          .from("profiles")
          .update({ role: "employee", updated_at: new Date().toISOString() })
          .eq("id", user.id);
        role = "employee";
      }
    } catch (err) {
      console.error("EmployeeLayout activation safety net error:", err);
    }
  }

  if (role !== "employee") {
    redirect("/applicant/dashboard");
  }

  const first = (profile?.first_name || (typeof user.user_metadata?.first_name === "string" ? user.user_metadata.first_name : "")).trim();
  const last = (profile?.last_name || (typeof user.user_metadata?.last_name === "string" ? user.user_metadata.last_name : "")).trim();
  const userInitials = first && last
    ? `${first[0]}${last[0]}`.toUpperCase()
    : first
      ? first.slice(0, 2).toUpperCase()
      : (user.email ?? "U").slice(0, 2).toUpperCase();

  let companyName: string | null = null;
  let hasDirectReports = false;
  try {
    const admin = getAdminClient();
    let tenantId = profile?.tenant_id?.trim() || "";

    const { data: myEmployee } = await admin
      .from("employees")
      .select("id, tenant_id")
      .eq("profile_id", user.id)
      .eq("employment_status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; tenant_id?: string | null }>();

    if (!tenantId) {
      tenantId = myEmployee?.tenant_id?.trim() || "";
    }

    if (myEmployee?.id) {
      const { data: directReports } = await admin
        .from("employees")
        .select(
          "id, job_title, job_level, work_mode, department_id, profile:profiles!profile_id(first_name, last_name, email)",
        )
        .eq("reports_to", myEmployee.id)
        .eq("employment_status", "active");
      hasDirectReports = (directReports ?? []).length > 0;
    }

    if (tenantId) {
      const { data: tenantRow } = await admin
        .from("tenants")
        .select("name")
        .eq("id", tenantId)
        .maybeSingle<{ name?: string | null }>();
      companyName = tenantRow?.name?.trim() || null;
    }
  } catch {
    companyName = null;
    hasDirectReports = false;
  }

  const navItems = [
    { label: "Home", href: "/employee/dashboard", icon: "home" },
    { label: "Schedule", href: "/employee/schedule", icon: "calendar_today" },
    { label: "Leaves", href: "/employee/leaves", icon: "event_note" },
    ...(hasDirectReports
      ? [{ label: "My Team", href: "/employee/team", icon: "groups" }]
      : []),
    { label: "Payslips", href: "/employee/payslips", icon: "payments" },
    { label: "Profile", href: "/employee/profile", icon: "person" },
  ];

  return (
    <PwaShell
      variant="employee"
      userInitials={userInitials}
      initialCompanyName={companyName}
      config={{
        label: "Employee Portal",
        navItems,
      }}
    >
      {children}
    </PwaShell>
  );
}