import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { requireHrPermission } from "@/lib/rbac/server";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import GeofenceControlCard from "./geofence-control-card";
import CompensationEditorCard from "./compensation-editor-card";
import HROnboardingDocumentsSection from "./_components/HROnboardingDocumentsSection";
import { resolveOfferCompensation, type JobPostingSalarySource, type OfferSalarySource } from "@/lib/offer-salary";
import { getJobPostingPositionForProfile } from "@/lib/employee-position-server";
import { resolveEmployeeSourceOfTruth } from "@/lib/work-arrangement";
import type { OfficeBranch, EmployeeRemoteResidence, Profile, WorkSetup } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EmployeeDetailPage({ params }: Props) {
  const resolvedParams = await params;
  const employeeId = resolvedParams.id;
  const ctx = await requireHrPermission("workforce:view");

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select(`*, profiles ( first_name, last_name, email ), departments ( id, name )`)
    .eq("id", employeeId)
    .single();

  if (!employee) redirect("/hr/employees");

  const { data: departmentsList } = await admin
    .from("departments")
    .select("id, name")
    .order("name", { ascending: true });

  const tenantId = ctx.tenant_id ?? employee.tenant_id ?? null;
  let branchesQuery = admin
    .from("office_branches")
    .select("*")
    .order("name", { ascending: true });
  if (tenantId) {
    branchesQuery = branchesQuery.eq("tenant_id", tenantId);
  }
  const { data: officeBranches } = await branchesQuery.returns<OfficeBranch[]>();
  const mergedBranches: OfficeBranch[] = officeBranches ?? [];

  const { data: remoteResidence } = await admin
    .from("employee_remote_residences")
    .select("*")
    .eq("employee_id", employeeId)
    .maybeSingle<EmployeeRemoteResidence>();

  const storedSalary = Number(employee.base_salary ?? employee.salary ?? 0);
  const storedAllowance = (employee as { monthly_allowance?: number | string | null }).monthly_allowance;
  const storedIncentive = (employee as { attendance_incentive?: number | string | null }).attendance_incentive;

  let resolvedInitialSalary = storedSalary > 0 ? storedSalary : 35000;
  let resolvedInitialAllowance =
    storedAllowance !== null && storedAllowance !== undefined && Number.isFinite(Number(storedAllowance))
      ? Number(storedAllowance)
      : 0;
  let resolvedInitialIncentive =
    storedIncentive !== null && storedIncentive !== undefined && Number.isFinite(Number(storedIncentive))
      ? Number(storedIncentive)
      : 0;

  const needsOfferFallback =
    storedSalary <= 0 ||
    storedAllowance === null ||
    storedAllowance === undefined ||
    storedIncentive === null ||
    storedIncentive === undefined;

  if (needsOfferFallback && (employee.application_id || employee.profile_id)) {
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

      const offerComp = resolveOfferCompensation(
        linkedOffer as OfferSalarySource | null,
        linkedPosting,
        35000,
      );

      if (storedSalary <= 0) {
        resolvedInitialSalary = offerComp.baseSalary;
      }
      if (storedAllowance === null || storedAllowance === undefined) {
        resolvedInitialAllowance = offerComp.monthlyAllowance;
      }
      if (storedIncentive === null || storedIncentive === undefined) {
        resolvedInitialIncentive = offerComp.attendanceIncentive;
      }
    }
  }
    
  const p = employee.profiles as unknown as { first_name: string; last_name: string; email: string; };
  const linkedJob = employee.profile_id
    ? await getJobPostingPositionForProfile(employee.profile_id)
    : null;
  const empDept = (employee as { departments?: { name?: string | null } | null }).departments;
  const sourceOfTruth = resolveEmployeeSourceOfTruth({
    employee: {
      job_title: employee.job_title,
      work_mode: employee.work_mode,
      departments: empDept ?? null,
    },
    offer: linkedJob
      ? { job_title: linkedJob.offerTitle, work_setup: linkedJob.offerWorkSetup }
      : null,
    jobPosting: linkedJob
      ? {
          title: linkedJob.title,
          department: linkedJob.departmentName,
          work_setup: linkedJob.jobWorkSetup,
        }
      : null,
  });
  const resolvedRole = sourceOfTruth.position;

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
              {resolvedRole} • {sourceOfTruth.department} • {employee.employee_number}
            </p>
          </div>
        </div>

        {/* Compensation & Pay Frequency */}
        <CompensationEditorCard
          employeeId={employee.id}
          initialBaseSalary={resolvedInitialSalary}
          initialMonthlyAllowance={resolvedInitialAllowance}
          initialAttendanceIncentive={resolvedInitialIncentive}
          initialPayFrequency={String(employee.pay_frequency ?? "monthly")}
          currency={String(employee.currency ?? "PHP")}
        />

        {/* Location & Geofence Control */}
        <GeofenceControlCard
          employeeId={employee.id}
          initialWorkMode={sourceOfTruth.workSetup as WorkSetup}
          initialBranchId={employee.work_location_id || linkedJob?.workLocationId || null}
          initialDepartmentId={employee.department_id ?? linkedJob?.departmentId ?? null}
          departments={departmentsList ?? []}
          officeBranches={mergedBranches}
          remoteResidence={remoteResidence || null}
        />
        
        {/* Onboarding Documents Section */}
        <HROnboardingDocumentsSection employeeId={employee.id} />
      </div>
    </PageContainer>
  );
}
