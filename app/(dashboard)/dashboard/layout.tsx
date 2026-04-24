import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/layout/bottom-nav";
import PunchBar from "@/components/layout/punch-bar"; // ← new
import type { UserRole } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: UserRole = "candidate";
  let employeeId: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = (profile?.role as UserRole) ?? "candidate";

    // Fetch employee id for punch bar
    if (role === "employee") {
      const { data: employee } = await supabase
        .from("employees")
        .select("id")
        .eq("profile_id", user.id)
        .eq("employment_status", "active")
        .single();
      employeeId = employee?.id ?? null;
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {role === "employee" && employeeId && (
        <PunchBar employeeId={employeeId} /> // ← new
      )}
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav role={role} />
    </div>
  );
}