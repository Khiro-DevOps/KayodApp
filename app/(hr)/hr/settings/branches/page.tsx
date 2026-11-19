import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import BranchManager from "./branch-manager";
import type { OfficeBranch } from "@/lib/types";
import { PageHeroHeader } from "@/components/ui/option-b-surfaces";

export default async function BranchesSettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";
  if (!isHR) redirect("/dashboard");

  const { data: branches } = await supabase
    .from("office_branches")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<OfficeBranch[]>();

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeroHeader
          eyebrow="Workspace Settings"
          title="Office Branches"
          subtitle="Manage your company's physical office locations for attendance tracking."
        />
        <BranchManager initialBranches={branches || []} />
      </div>
    </PageContainer>
  );
}
