import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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
    .select("role")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);

  if (role === "hr_manager" || role === "admin") {
    redirect("/hr");
  }

  if (role !== "employee") {
    redirect("/applicant/dashboard");
  }

  return (
    <PwaShell
      variant="employee"
      config={{
        label: "Employee Portal",
        navItems: [
          { label: "Home", href: "/employee/dashboard", icon: "home" },
          { label: "Schedule", href: "/employee/schedule", icon: "calendar_today" },
          { label: "Attendance", href: "/employees/attendance", icon: "fact_check" },
          { label: "Leaves", href: "/employee/leaves", icon: "event_note" },
          { label: "Payslips", href: "/employee/payslips", icon: "payments" },
          { label: "Profile", href: "/employee/profile", icon: "person" },
        ],
      }}
    >
      {children}
    </PwaShell>
  );
}