import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { requireHrPermission } from "@/lib/rbac/server";
import HRPayrollPage from "../payroll/hr-payroll-page";
import PayrollPage from "../payroll/page";

export default async function HRPayslipsRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; error?: string }>;
}) {
  const resolvedParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> })
    .raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();

  const role = effectiveRole(profile?.role, authRole);
  if (isHRRole(role)) {
    await requireHrPermission("payroll:manage");
    return (
      <HRPayrollPage
        selectedPeriodId={resolvedParams?.periodId}
        errorMessage={resolvedParams?.error}
      />
    );
  }

  return <PayrollPage searchParams={searchParams} />;
}
