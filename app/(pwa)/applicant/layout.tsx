import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { effectiveRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";

import PwaShell from "@/components/layout/pwa-shell";

export default async function ApplicantLayout({
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
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "role" | "first_name" | "last_name">>();

  const role = effectiveRole(profile?.role, authRole);

  if (role === "employee") {
    redirect("/employee/dashboard");
  }

  if (role === "hr_manager" || role === "admin") {
    redirect("/hr");
  }

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const userName = fullName || "Jay Gomez";

  void userName;

  return (
    <PwaShell
      variant="applicant"
      config={{
        label: "Applicant Portal",
        navItems: [
          { label: "Home", href: "/applicant/dashboard", icon: "home" },
          { label: "Jobs", href: "/applicant/jobs", icon: "work" },
          { label: "Applications", href: "/applicant/applications", icon: "assignment" },
          { label: "Resume", href: "/applicant/resume", icon: "description" },
          { label: "Profile", href: "/applicant/profile", icon: "person" },
        ],
      }}
    >
      {children}
    </PwaShell>
  );
}