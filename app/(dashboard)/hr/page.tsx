import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Profile } from "@/lib/types";
import { effectiveRole, isHRRole, roleLabel } from "@/lib/roles";
import HRDashboardView from "./hr-dashboard-view";

export default async function HRDashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;
  
  const { data: profile } = await supabase
  .from('profiles')
  .select(`
    *,
    tenants (
      name
    )
  `)
  .eq('id', user.id)
  .single();

const companyName = profile?.tenants?.name || "Your Company";

  const effective = effectiveRole(profile?.role, authRole);
  if (!isHRRole(effective)) redirect("/dashboard");

  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : "HR Manager";

  return (
    <PageContainer>
      <HRDashboardView fullName={fullName} roleLabelText={roleLabel(effective)} />
    </PageContainer>
  );
}
