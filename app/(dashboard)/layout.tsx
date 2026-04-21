import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/layout/bottom-nav";
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

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav role={role} />
    </div>
  );
}