import { createClient } from "@/lib/supabase/server";
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

  const missingSalaryAppIds = Array.from(
    new Set(
      (employees ?? [])
        .filter((emp) => Number(emp.base_salary ?? emp.salary ?? 0) <= 0 && Boolean(emp.application_id))
        .map((emp) => emp.application_id as string)
    )
  );

  const offerByAppId = new Map<string, OfferSalarySource>();
  const postingByAppId = new Map<string, JobPostingSalarySource>();

  if (missingSalaryAppIds.length > 0) {
    const [{ data: offers }, { data: applications }] = await Promise.all([
      supabase
        .from("job_offers")
        .select("application_id, salary, financial_package, job_metadata, metadata, updated_at")
        .in("application_id", missingSalaryAppIds)
        .order("updated_at", { ascending: false }),
      supabase
        .from("job_applications")
        .select("id, job_postings ( salary_min, salary_max )")
        .in("id", missingSalaryAppIds),
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
      if (posting) {
        postingByAppId.set(row.id, posting);
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
    const resolvedMonthlySalary =
      storedSalary > 0
        ? storedSalary
        : emp.application_id
          ? resolveOfferSalary(
              offerByAppId.get(emp.application_id),
              postingByAppId.get(emp.application_id),
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