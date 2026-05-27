import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/layout/dashboard-shell";
import type { UserRole } from "@/lib/types";
import { effectiveRole } from "@/lib/roles";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: UserRole = "candidate";

  if (user) {
    const authRole = (user.user_metadata?.role) as string | undefined;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")        
      .eq("id", user.id)
      .single();
    role = effectiveRole(profile?.role, authRole);
  }

  return <DashboardShell role={role} userId={user?.id ?? null}>{children}</DashboardShell>;
}