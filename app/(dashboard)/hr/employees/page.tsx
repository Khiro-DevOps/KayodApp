import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { resolveOfferSalary, type JobPostingSalarySource, type OfferSalarySource } from "@/lib/offer-salary";
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

  const [{ data: employees }, { data: officeBranches }] = await Promise.all([
    supabase
      .from("employees")
      .select(`
        *,
        profiles ( first_name, last_name, email, phone, avatar_url ),
        departments ( name )
      `)
      .order("created_at", { ascending: false })
      .returns<Employee[]>(),
    supabase
      .from("office_branches")
      .select("id, name")
      .returns<Array<{ id: string; name: string }>>(),
  ]);

  const branchNameById = new Map(
    (officeBranches ?? []).map((b) => [b.id, b.name])
  );

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

  const directoryEmployees: DirectoryEmployee[] = (employees ?? []).map((emp) => {
    const p = emp.profiles as unknown as {
      first_name?: string;
      last_name?: string;
      email?: string;
    } | null;
    const dept = emp.departments as unknown as { name?: string } | null;
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

    return {
      id: emp.id,
      fullName,
      initials: getInitials(fullName),
      jobTitle: emp.job_title || "Staff",
      departmentName: dept?.name ?? null,
      email: p?.email ?? null,
      employmentStatus: emp.employment_status || "active",
      workMode: normalizeWorkMode(emp.work_mode),
      branchName:
        (emp.work_location_id ? branchNameById.get(emp.work_location_id) : undefined) ||
        "Main HQ",
      monthlySalary: resolvedMonthlySalary,
      startDate: emp.start_date ?? null,
    };
  });

  return (
    <PageContainer>
      <div className="w-full px-6 py-6">
        <EmployeesDirectoryClient employees={directoryEmployees} />
      </div>
    </PageContainer>
  );
}