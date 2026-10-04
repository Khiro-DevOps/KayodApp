import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import GeofenceControlCard from "./geofence-control-card";
import HROnboardingDocumentsSection from "./_components/HROnboardingDocumentsSection";
import type { OfficeBranch, EmployeeRemoteResidence, Profile } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EmployeeDetailPage({ params }: Props) {
  const resolvedParams = await params;
  const employeeId = resolvedParams.id;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";
  if (!isHR) redirect("/dashboard");

  const { data: employee } = await supabase
    .from("employees")
    .select(`*, profiles ( first_name, last_name, email )`)
    .eq("id", employeeId)
    .single();

  if (!employee) redirect("/hr/employees");

  const { data: officeBranches } = await supabase
    .from("office_branches")
    .select("*")
    .order("name", { ascending: true })
    .returns<OfficeBranch[]>();

  const { data: remoteResidence } = await supabase
    .from("employee_remote_residences")
    .select("*")
    .eq("employee_id", employeeId)
    .maybeSingle<EmployeeRemoteResidence>();
    
  const p = employee.profiles as unknown as { first_name: string; last_name: string; email: string; };

  return (
    <PageContainer>
      <div className="space-y-8 max-w-5xl">
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <Link
            href="/hr/employees"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-bg transition-colors"
          >
            ←
          </Link>
          <div>
            <h1 className="font-h1 text-2xl font-bold text-text-main">
              {p ? `${p.first_name} ${p.last_name}` : "Employee Details"}
            </h1>
            <p className="text-sm text-text-muted">
              {employee.job_title} • {employee.employee_number}
            </p>
          </div>
        </div>

        {/* Location & Geofence Control */}
        <GeofenceControlCard
          employeeId={employee.id}
          initialWorkMode={employee.work_model as any || "onsite"}
          initialBranchId={employee.work_location_id || null}
          officeBranches={officeBranches || []}
          remoteResidence={remoteResidence || null}
        />
        
        {/* Onboarding Documents Section */}
        <HROnboardingDocumentsSection employeeId={employee.id} />
      </div>
    </PageContainer>
  );
}
