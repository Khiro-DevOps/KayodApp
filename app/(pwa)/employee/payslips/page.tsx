import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import EmployeePayslipsClient from "./employee-payslips-client";
import type { EmployeePayslip } from "@/lib/types";

export default async function EmployeePayslipsPage() {
  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch employee record safely for current authenticated user
  const { data: employee } = await admin
    .from("employees")
    .select("id, tenant_id, employee_number, job_title, profile_id, profiles(first_name, last_name)")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!employee) {
    redirect("/applicant/dashboard");
  }

  // Fetch tenant company name
  let companyName = "Kayod Corporation";
  if (employee.tenant_id) {
    const { data: tenant } = await admin
      .from("tenants")
      .select("name")
      .eq("id", employee.tenant_id)
      .maybeSingle();
    if (tenant?.name) {
      companyName = tenant.name;
    }
  }

  // Query published payslips ordered by pay_date DESC
  const { data: payslipsData } = await admin
    .from("payslips")
    .select("*")
    .eq("employee_id", employee.id)
    .eq("status", "published")
    .order("pay_date", { ascending: false });

  const rawPayslips = payslipsData ?? [];
  const payslips: EmployeePayslip[] = rawPayslips.map((p: any) => ({
    ...p,
    gross_pay: Number(p.gross_pay || 0),
    basic_pay: Number(p.basic_pay || 0),
    allowances: Number(p.allowances || 0),
    overtime_pay: Number(p.overtime_pay || 0),
    sss_deduction: Number(p.sss_deduction || 0),
    philhealth_deduction: Number(p.philhealth_deduction || 0),
    pagibig_deduction: Number(p.pagibig_deduction || 0),
    withholding_tax: Number(p.withholding_tax || 0),
    other_deductions: Number(p.other_deductions || 0),
    total_deductions: Number(p.total_deductions || 0),
    net_pay: Number(p.net_pay || 0),
  }));

  const profile = employee.profiles as { first_name?: string; last_name?: string } | null;
  const employeeName = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
    : "Employee";
  const employeeIdNumber = employee.employee_number ?? "N/A";
  const jobTitle = employee.job_title ?? "Employee";

  return (
    <EmployeePayslipsClient
      payslips={payslips}
      employeeName={employeeName}
      employeeIdNumber={employeeIdNumber}
      jobTitle={jobTitle}
      companyName={companyName}
    />
  );
}
