import { createClient } from "@/lib/supabase/server";
import { effectiveRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function DashboardRedirectPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);

  if (role === "employee") {
    redirect("/employee/dashboard");
  }

  if (role === "hr_manager" || role === "admin") {
    redirect("/hr");
  }

  redirect("/applicant/dashboard");
}