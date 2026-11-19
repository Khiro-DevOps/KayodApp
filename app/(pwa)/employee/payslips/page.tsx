import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import EmployeePayslipsClient from "./employee-payslips-client";
import { resolveEmployeePosition } from "@/lib/employee-position";
import { getJobPostingPositionForProfile } from "@/lib/employee-position-server";
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

  // Query published/paid payslips joining payroll_periods
  const { data: payslipsData } = await admin
    .from("payslips")
    .select("*, payroll_periods(period_start, period_end, pay_date)")
    .eq("employee_id", employee.id)
    .in("status", ["published", "paid"])
    .order("created_at", { ascending: false });

  const rawPayslips = payslipsData ?? [];
  const payslips: EmployeePayslip[] = rawPayslips.map((p: any) => {
    const period = Array.isArray(p.payroll_periods) ? p.payroll_periods[0] : p.payroll_periods;
    const basicPay = Number(p.basic_pay || 0);
    const allowances = Number(p.allowances || 0);
    const overtimePay = Number(p.overtime_pay || 0);
    const bonuses = Number(p.bonuses || 0);
    const sss = Number(p.sss_contribution ?? p.sss_deduction ?? 0);
    const philhealth = Number(p.philhealth_contrib ?? p.philhealth_deduction ?? 0);
    const pagibig = Number(p.pagibig_contrib ?? p.pagibig_deduction ?? 0);
    const tax = Number(p.withholding_tax || 0);
    const other = Number(p.other_deductions || 0);
    const computedGross = basicPay + allowances + overtimePay + bonuses;
    const computedDeductions = sss + philhealth + pagibig + tax + other;
    const grossPay = Number(p.gross_pay ?? computedGross);
    const totalDeductions = Number(p.total_deductions ?? computedDeductions);
    const netPay = Number(p.net_pay ?? (grossPay - totalDeductions));

    return {
      ...p,
      payroll_period_start: period?.period_start ?? p.payroll_period_start ?? "",
      payroll_period_end: period?.period_end ?? p.payroll_period_end ?? "",
      pay_date: period?.pay_date ?? p.pay_date ?? p.created_at ?? "",
      gross_pay: grossPay,
      basic_pay: basicPay,
      allowances,
      overtime_pay: overtimePay,
      sss_deduction: sss,
      philhealth_deduction: philhealth,
      pagibig_deduction: pagibig,
      withholding_tax: tax,
      other_deductions: other,
      total_deductions: totalDeductions,
      net_pay: netPay,
    };
  });

  payslips.sort((a, b) => new Date(b.pay_date || b.created_at).getTime() - new Date(a.pay_date || a.created_at).getTime());

  const profile = employee.profiles as { first_name?: string; last_name?: string } | null;
  const employeeName = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
    : "Employee";
  const employeeIdNumber = employee.employee_number ?? "N/A";
  const linkedJob = await getJobPostingPositionForProfile(user.id);
  const jobTitle = resolveEmployeePosition({
    employeePosition: employee.job_title,
    jobTitle: linkedJob?.title,
  }).position;

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
