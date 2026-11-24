import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { requireHrPermission } from "@/lib/rbac/server";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import GeofenceControlCard from "./geofence-control-card";
import CompensationEditorCard from "./compensation-editor-card";
import HierarchyControlCard from "./hierarchy-control-card";
import HROnboardingDocumentsSection from "./_components/HROnboardingDocumentsSection";
import { canHr } from "@/lib/rbac/permissions";
import {
  filterAndSortSupervisorCandidates,
  normalizeJobLevel,
  type SupervisorCandidate,
} from "@/lib/workforce-hierarchy";
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

  let tenantEmployeesQuery = admin
    .from("employees")
    .select(
      `id, tenant_id, department_id, job_title, job_level, employment_status, profile:profiles!profile_id(first_name, last_name), departments(id, name)`,
    )
    .eq("employment_status", "active");
  if (tenantId) {
    tenantEmployeesQuery = tenantEmployeesQuery.eq("tenant_id", tenantId);
  }

  const [{ count: activeDirectReportsCount }, { data: rawTenantEmployees }] =
    await Promise.all([
      admin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("reports_to", employeeId)
        .eq("employment_status", "active"),
      tenantEmployeesQuery,
    ]);

  const rawCandidates: SupervisorCandidate[] = (rawTenantEmployees ?? []).map(
    (row) => {
      const r = row as {
        id: string;
        tenant_id?: string | null;
        department_id?: string | null;
        job_title?: string | null;
        job_level?: string | null;
        employment_status?: string | null;
        profile?:
          | { first_name?: string | null; last_name?: string | null }
          | Array<{ first_name?: string | null; last_name?: string | null }>
          | null;
        departments?:
          | { id?: string; name?: string | null }
          | Array<{ id?: string; name?: string | null }>
          | null;
      };
      const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      const dept = Array.isArray(r.departments)
        ? r.departments[0]
        : r.departments;
      const fullName =
        [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() ||
        "Employee";

      return {
        id: r.id,
        tenant_id: r.tenant_id ?? null,
        department_id: r.department_id ?? null,
        department_name: dept?.name ?? null,
        job_title: r.job_title ?? "Employee",
        job_level: normalizeJobLevel(r.job_level),
        employment_status: r.employment_status ?? "active",
        full_name: fullName,
      };
    },
  );

  const supervisorCandidates = filterAndSortSupervisorCandidates(rawCandidates, {
    currentEmployeeId: employee.id,
    tenantId,
    departmentId: employee.department_id ?? null,
    leadershipOnly: true,
  });

  const canManageWorkforce = canHr(
    ctx.hr_role,
    "workforce:manage",
    ctx.is_tenant_owner,
  );

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

        {/* Organization Hierarchy & Status */}
        <HierarchyControlCard
          employeeId={employee.id}
          employeeName={p ? `${p.first_name} ${p.last_name}` : "Employee"}
          initialJobLevel={normalizeJobLevel(
            (employee as { job_level?: string | null }).job_level,
          )}
          initialReportsTo={employee.reports_to ?? null}
          initialEmploymentStatus={String(employee.employment_status ?? "active")}
          activeDirectReportsCount={activeDirectReportsCount ?? 0}
          supervisorCandidates={supervisorCandidates}
          canManage={canManageWorkforce}
        />

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
