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
  let unreadNotificationCount = 0;

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

    if (role === "candidate") {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("is_read", false);

      unreadNotificationCount = count ?? 0;
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {role === "employee" && employeeId && (
        <PunchBar employeeId={employeeId} /> // ← new
      )}
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav
        role={role}
        userId={user?.id ?? null}
        initialUnreadCount={unreadNotificationCount}
      />
    </div>
  );
}