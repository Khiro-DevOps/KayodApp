import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Employee, Profile } from "@/lib/types";
import Link from "next/link";

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

  const { data: employees } = await supabase
    .from("employees")
    .select(`
      *,
      profiles ( first_name, last_name, email, phone, avatar_url ),
      departments ( name )
    `)
    .order("created_at", { ascending: false })
    .returns<Employee[]>();

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-bg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
            </Link>
            <h1 className="font-h1 text-xl font-bold text-text-main">
              Employees
            </h1>
          </div>
          <span className="text-sm text-text-muted">
            {employees?.length ?? 0} total
          </span>
        </div>

        {!employees || employees.length === 0 ? (
          <div className="rounded-xl bg-card-bg border border-dashed border-border p-6 text-center space-y-2 shadow-xs">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary-light/50 text-primary-dark">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
              </svg>
            </div>
            <p className="text-sm text-text-muted">No employees yet</p>
            <p className="text-xs text-text-muted">
              Employees are added automatically when you hire applicants
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {employees.map((emp) => {
              const p = emp.profiles as unknown as {
                first_name: string;
                last_name: string;
                email: string;
              };
              const dept = emp.departments as unknown as { name: string } | null;
              const fullName = p ? `${p.first_name} ${p.last_name}` : "Employee";
              const initial = fullName.charAt(0).toUpperCase();

              return (
                <div
                  key={emp.id}
                  className="rounded-xl bg-card-bg border border-border p-4 space-y-3 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary-dark font-bold text-sm">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-main truncate">
                          {fullName}
                        </p>
                        <p className="text-xs text-text-muted truncate">
                          {emp.job_title}
                          {dept?.name ? ` · ${dept.name}` : ""}
                        </p>
                        {p?.email && (
                          <p className="text-xs text-text-muted/80 truncate">{p.email}</p>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      emp.employment_status === "active"
                        ? "bg-success-bg text-success border border-success/20"
                        : emp.employment_status === "on_leave"
                        ? "bg-warning-bg text-warning border border-warning/20"
                        : "bg-surface-bg text-text-muted border border-border"
                    }`}>
                      {emp.employment_status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted pt-1 border-t border-border/40">
                    <span className="font-mono">{emp.employee_number}</span>
                    <span>Started {new Date(emp.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>
                    <span className="capitalize">{emp.employment_type.replace("_", " ")}</span>
                    <span className="font-semibold text-text-main">
                      ₱{emp.base_salary.toLocaleString()} / {emp.pay_frequency.replace("_", " ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}