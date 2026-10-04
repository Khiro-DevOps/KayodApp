import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import BranchManager from "./branch-manager";
import type { OfficeBranch } from "@/lib/types";

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
        <div className="border-b border-border pb-5">
          <h1 className="font-h1 text-2xl font-bold text-text-main">
            Office Branches
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Manage your company's physical office locations for attendance tracking.
          </p>
        </div>
        <BranchManager initialBranches={branches || []} />
      </div>
    </PageContainer>
  );
}
