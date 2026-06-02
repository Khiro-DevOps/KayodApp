import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { effectiveRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";

import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";

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

  // Fetch counts for Header metrics
  const [{ count: applicationsCount }, { count: interviewsCount }] = await Promise.all([
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("candidate_id", user.id),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("candidate_id", user.id)
      .eq("status", "interview_scheduled"),
  ]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header 
        userName={userName} 
        notificationCount={5} 
        applicationsCount={applicationsCount ?? 0}
        interviewsPendingCount={interviewsCount ?? 0}
      />
      <main className="flex-1 pb-24 md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}