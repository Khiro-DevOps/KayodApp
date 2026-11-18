import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import GeofenceControlCard from "./geofence-control-card";
import CompensationEditorCard from "./compensation-editor-card";
import HROnboardingDocumentsSection from "./_components/HROnboardingDocumentsSection";
import { resolveOfferSalary, type JobPostingSalarySource, type OfferSalarySource } from "@/lib/offer-salary";
import type { OfficeBranch, EmployeeRemoteResidence, Profile, WorkSetup } from "@/lib/types";

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

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select(`*, profiles ( first_name, last_name, email )`)
    .eq("id", employeeId)
    .single();

  if (!employee) redirect("/hr/employees");

  const [{ data: workLocations }, { data: officeBranches }] = await Promise.all([
    supabase
      .from("work_locations")
      .select("id, tenant_id, name, address, latitude, longitude, radius_meters, is_default, created_at")
      .order("name", { ascending: true }),
    supabase
      .from("office_branches")
      .select("*")
      .order("name", { ascending: true })
      .returns<OfficeBranch[]>(),
  ]);

  const mergedBranches: OfficeBranch[] = (() => {
    const byId = new Map<string, OfficeBranch>();
    (workLocations ?? []).forEach((loc) => {
      byId.set(loc.id, loc as unknown as OfficeBranch);
    });
    (officeBranches ?? []).forEach((branch) => {
      if (!byId.has(branch.id)) {
        byId.set(branch.id, branch);
      }
    });
    return Array.from(byId.values());
  })();

  const { data: remoteResidence } = await supabase
    .from("employee_remote_residences")
    .select("*")
    .eq("employee_id", employeeId)
    .maybeSingle<EmployeeRemoteResidence>();

  const storedSalary = Number(employee.base_salary ?? employee.salary ?? 0);
  let resolvedInitialSalary = storedSalary > 0 ? storedSalary : 35000;

  if (storedSalary <= 0 && (employee.application_id || employee.profile_id)) {
    let targetAppId: string | null = employee.application_id ?? null;

    if (!targetAppId && employee.profile_id) {
      const { data: profileJobApp } = await admin
        .from("job_applications")
        .select("id")
        .eq("applicant_id", employee.profile_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profileJobApp?.id) {
        targetAppId = profileJobApp.id;
      } else {
        const { data: profileLegacyApp } = await admin
          .from("applications")
          .select("id")
          .eq("candidate_id", employee.profile_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        targetAppId = profileLegacyApp?.id ?? null;
      }
    }

    if (targetAppId) {
      const [{ data: linkedOffer }, { data: linkedApp }] = await Promise.all([
        admin
          .from("job_offers")
          .select("salary, financial_package, job_metadata, metadata")
          .eq("application_id", targetAppId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("job_applications")
          .select("job_postings ( salary_min, salary_max )")
          .eq("id", targetAppId)
          .maybeSingle(),
      ]);

      const rawPosting = (
        linkedApp as { job_postings?: JobPostingSalarySource | JobPostingSalarySource[] | null } | null
      )?.job_postings;
      const linkedPosting = Array.isArray(rawPosting)
        ? rawPosting[0] ?? null
        : rawPosting ?? null;

      resolvedInitialSalary = resolveOfferSalary(
        linkedOffer as OfferSalarySource | null,
        linkedPosting,
        35000,
      );
    }
  }
    
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

        {/* Compensation & Pay Frequency */}
        <CompensationEditorCard
          employeeId={employee.id}
          initialBaseSalary={resolvedInitialSalary}
          initialPayFrequency={String(employee.pay_frequency ?? "monthly")}
          currency={String(employee.currency ?? "PHP")}
        />

        {/* Location & Geofence Control */}
        <GeofenceControlCard
          employeeId={employee.id}
          initialWorkMode={(employee.work_mode ?? "onsite") as WorkSetup}
          initialBranchId={employee.work_location_id || null}
          officeBranches={mergedBranches}
          remoteResidence={remoteResidence || null}
        />
        
        {/* Onboarding Documents Section */}
        <HROnboardingDocumentsSection employeeId={employee.id} />
      </div>
    </PageContainer>
  );
}
