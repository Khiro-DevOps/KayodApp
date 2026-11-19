import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { resolveOfferSalary, type JobPostingSalarySource, type OfferSalarySource } from "@/lib/offer-salary";
import { resolveEmployeePosition } from "@/lib/employee-position";
import { getJobPostingPositionsByProfileIds } from "@/lib/employee-position-server";
import type { Employee, Profile } from "@/lib/types";
import EmployeesDirectoryClient, {
  type DirectoryEmployee,
} from "./employees-directory-client";

function normalizeWorkMode(raw: unknown): "onsite" | "hybrid" | "remote" {
  const value = String(raw ?? "onsite").toLowerCase();
  if (value === "hybrid") return "hybrid";
  if (value === "remote" || value === "wfh") return "remote";
  return "onsite";
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "E";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

export default async function EmployeesPage() {
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

  const [{ data: employees }, { data: officeBranches }, { data: remoteResidences }] = await Promise.all([
    admin
      .from("employees")
      .select(`
        *,
        profiles ( first_name, last_name, email, phone, avatar_url ),
        departments ( name )
      `)
      .order("created_at", { ascending: false })
      .returns<Employee[]>(),
    admin
      .from("office_branches")
      .select("id, name")
      .returns<Array<{ id: string; name: string }>>(),
    admin
      .from("employee_remote_residences")
      .select("employee_id, city, address, is_active"),
  ]);

  const branchNameById = new Map(
    (officeBranches ?? []).map((b) => [b.id, b.name])
  );
  const remoteResidenceByEmpId = new Map<
    string,
    { city?: string | null; address?: string | null; is_active?: boolean | null }
  >();
  for (const res of remoteResidences ?? []) {
    const row = res as {
      employee_id?: string | null;
      city?: string | null;
      address?: string | null;
      is_active?: boolean | null;
    };
    if (row.employee_id && row.is_active !== false) {
      remoteResidenceByEmpId.set(row.employee_id, row);
    }
  }

  const missingSalaryEmployees = (employees ?? []).filter(
    (emp) => Number(emp.base_salary ?? emp.salary ?? 0) <= 0
  );
  const missingSalaryAppIds = Array.from(
    new Set(
      missingSalaryEmployees
        .filter((emp) => Boolean(emp.application_id))
        .map((emp) => emp.application_id as string)
    )
  );
  const missingSalaryProfileIds = Array.from(
    new Set(
      missingSalaryEmployees
        .filter((emp) => Boolean(emp.profile_id))
        .map((emp) => emp.profile_id as string)
    )
  );

  const offerByAppId = new Map<string, OfferSalarySource>();
  const postingByAppId = new Map<string, JobPostingSalarySource>();
  const appIdByProfileId = new Map<string, string>();

  if (missingSalaryAppIds.length > 0 || missingSalaryProfileIds.length > 0) {
    const admin = getAdminClient();

    if (missingSalaryProfileIds.length > 0) {
      const [{ data: profileJobApps }, { data: profileLegacyApps }] = await Promise.all([
        admin
          .from("job_applications")
          .select("id, applicant_id, job_postings ( salary_min, salary_max ), created_at")
          .in("applicant_id", missingSalaryProfileIds)
          .order("created_at", { ascending: false }),
        admin
          .from("applications")
          .select("id, candidate_id, job_postings ( salary_min, salary_max ), created_at")
          .in("candidate_id", missingSalaryProfileIds)
          .order("created_at", { ascending: false }),
      ]);

      for (const app of profileJobApps ?? []) {
        const row = app as {
          id: string;
          applicant_id?: string | null;
          job_postings?: JobPostingSalarySource | JobPostingSalarySource[] | null;
        };
        if (row.applicant_id && !appIdByProfileId.has(row.applicant_id)) {
          appIdByProfileId.set(row.applicant_id, row.id);
        }
        const posting = Array.isArray(row.job_postings)
          ? row.job_postings[0] ?? null
          : row.job_postings ?? null;
        if (posting && !postingByAppId.has(row.id)) {
          postingByAppId.set(row.id, posting);
        }
      }

      for (const app of profileLegacyApps ?? []) {
        const row = app as {
          id: string;
          candidate_id?: string | null;
          job_postings?: JobPostingSalarySource | JobPostingSalarySource[] | null;
        };
        if (row.candidate_id && !appIdByProfileId.has(row.candidate_id)) {
          appIdByProfileId.set(row.candidate_id, row.id);
        }
        const posting = Array.isArray(row.job_postings)
          ? row.job_postings[0] ?? null
          : row.job_postings ?? null;
        if (posting && !postingByAppId.has(row.id)) {
          postingByAppId.set(row.id, posting);
        }
      }
    }

    const allAppIds = Array.from(
      new Set([
        ...missingSalaryAppIds,
        ...Array.from(appIdByProfileId.values()),
      ])
    );

    if (allAppIds.length > 0) {
      const [{ data: offers }, { data: applications }] = await Promise.all([
        admin
          .from("job_offers")
          .select("application_id, salary, financial_package, job_metadata, metadata, created_at, updated_at")
          .in("application_id", allAppIds)
          .order("created_at", { ascending: false }),
        admin
          .from("job_applications")
          .select("id, job_postings ( salary_min, salary_max )")
          .in("id", allAppIds),
      ]);

      for (const offer of offers ?? []) {
        const appId = (offer as { application_id?: string | null }).application_id;
        if (appId && !offerByAppId.has(appId)) {
          offerByAppId.set(appId, offer as OfferSalarySource);
        }
      }

      for (const app of applications ?? []) {
        const row = app as {
          id: string;
          job_postings?: JobPostingSalarySource | JobPostingSalarySource[] | null;
        };
        const posting = Array.isArray(row.job_postings)
          ? row.job_postings[0] ?? null
          : row.job_postings ?? null;
        if (posting && !postingByAppId.has(row.id)) {
          postingByAppId.set(row.id, posting);
        }
      }
    }
  }

  const allProfileIds = Array.from(
    new Set((employees ?? []).map((emp) => emp.profile_id).filter(Boolean))
  );
  const jobPostingByProfileId = await getJobPostingPositionsByProfileIds(allProfileIds);

  const directoryEmployees: DirectoryEmployee[] = (employees ?? []).map((emp) => {
    const p = emp.profiles as unknown as {
      first_name?: string;
      last_name?: string;
      email?: string;
    } | null;
    const dept = emp.departments as unknown as { name?: string } | null;
    const linkedJob = emp.profile_id ? jobPostingByProfileId[emp.profile_id] : undefined;
    const resolvedPosition = resolveEmployeePosition({
      employeePosition: emp.job_title,
      jobTitle: linkedJob?.title,
      department: dept?.name,
      jobDepartment: linkedJob?.departmentName,
    });
    const fullName =
      [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || "Employee";
    const storedSalary = Number(emp.base_salary ?? emp.salary ?? 0);
    const resolvedAppId =
      emp.application_id ??
      (emp.profile_id ? appIdByProfileId.get(emp.profile_id) ?? null : null);
    const resolvedMonthlySalary =
      storedSalary > 0
        ? storedSalary
        : resolvedAppId
          ? resolveOfferSalary(
              offerByAppId.get(resolvedAppId),
              postingByAppId.get(resolvedAppId),
              0
            )
          : 0;

    const effectiveWorkMode = linkedJob?.workMode ?? normalizeWorkMode(emp.work_mode);
    const effectiveBranchId = linkedJob?.workLocationId ?? emp.work_location_id ?? null;
    const resolvedBranchName = effectiveBranchId
      ? branchNameById.get(effectiveBranchId) ?? null
      : null;
    const remoteResidence = remoteResidenceByEmpId.get(emp.id);

    let branchName = "To be set";
    let branchNeedsSetup = true;
    if (effectiveWorkMode === "onsite") {
      if (resolvedBranchName) {
        branchName = resolvedBranchName;
        branchNeedsSetup = false;
      }
    } else if (effectiveWorkMode === "hybrid") {
      if (resolvedBranchName && remoteResidence) {
        branchName = `${resolvedBranchName} + WFH`;
        branchNeedsSetup = false;
      }
    } else if (effectiveWorkMode === "remote") {
      if (remoteResidence) {
        const cityLabel = remoteResidence.city?.trim();
        branchName = cityLabel ? `WFH Verified (${cityLabel})` : "WFH Verified";
        branchNeedsSetup = false;
      }
    }

    return {
      id: emp.id,
      fullName,
      initials: getInitials(fullName),
      jobTitle: resolvedPosition.position,
      departmentName: resolvedPosition.department,
      email: p?.email ?? null,
      employmentStatus: emp.employment_status || "active",
      workMode: effectiveWorkMode,
      branchName,
      branchNeedsSetup,
      monthlySalary: resolvedMonthlySalary,
      startDate: emp.start_date ?? null,
    };
  });

  return (
    <PageContainer>
      <EmployeesDirectoryClient employees={directoryEmployees} />
    </PageContainer>
  );
}