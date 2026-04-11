import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewJobForm from "./new-job-form-client";
import { effectiveRole, isHRRole } from "@/lib/roles";

export default async function NewJobPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const authRole =
    (user.user_metadata as any)?.role ??
    ((user as any).raw_user_meta_data as any)?.role;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  return <NewJobForm />;
}
