"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  EmployeePayslip,
  EmployeePayslipDetails,
} from "@/lib/types";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * getEmployeePayslips():
 * Authenticates auth.uid() and resolves matching employee_id.
 * Queries all published payslips ordered by pay_date DESC.
 */
export async function getEmployeePayslips(): Promise<ActionResult<EmployeePayslip[]>> {
  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Resolve employee record matching auth.uid()
  const { data: employee, error: empErr } = await admin
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (empErr || !employee) {
    return { success: false, error: "Employee profile not found" };
  }

  // Query published/paid payslips ordered by pay_date DESC
  const { data: payslips, error: payslipsErr } = await admin
    .from("payslips")
    .select("*, payroll_periods(period_start, period_end, pay_date)")
    .eq("employee_id", employee.id)
    .in("status", ["published", "PUBLISHED", "paid"])
    .order("created_at", { ascending: false });

  if (payslipsErr) {
    console.error("Error fetching employee payslips:", payslipsErr);
    return { success: false, error: "Failed to fetch payslips" };
  }

  // Convert numeric types if needed and map to EmployeePayslip
  const typedPayslips: EmployeePayslip[] = (payslips || []).map((p: any) => {
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
    const grossPay = Number(p.gross_pay ?? (basicPay + allowances + overtimePay + bonuses));
    const totalDeductions = Number(p.total_deductions ?? (sss + philhealth + pagibig + tax + other));
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

  return {
    success: true,
    data: typedPayslips,
  };
}

/**
 * getPayslipDetails(payslipId: string):
 * Fetches a single payslip record ensuring strict ownership (employee_id belongs to auth.uid()).
 * Computes breakdown summaries for gross pay, total statutory deductions, and net pay.
 */
export async function getPayslipDetails(
  payslipId: string
): Promise<ActionResult<EmployeePayslipDetails>> {
  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!payslipId) {
    return { success: false, error: "Payslip ID is required" };
  }

  // Resolve employee record matching auth.uid()
  const { data: employee } = await admin
    .from("employees")
    .select("id, employee_number, job_title, profiles(first_name, last_name, email)")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!employee) {
    return { success: false, error: "Employee profile not found" };
  }

  // Fetch single payslip with strict employee_id ownership check
  const { data: payslip, error: payslipErr } = await admin
    .from("payslips")
    .select("*, payroll_periods(period_start, period_end, pay_date), employees(id, employee_number, job_title, tenant_id, profiles(first_name, last_name, email))")
    .eq("id", payslipId)
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (payslipErr || !payslip) {
    return { success: false, error: "Payslip not found or access denied" };
  }

  const period = Array.isArray((payslip as any).payroll_periods)
    ? (payslip as any).payroll_periods[0]
    : (payslip as any).payroll_periods;
  const basicPay = Number(payslip.basic_pay || 0);
  const allowances = Number(payslip.allowances || 0);
  const overtimePay = Number(payslip.overtime_pay || 0);
  const bonuses = Number((payslip as any).bonuses || 0);

  const sss = Number((payslip as any).sss_contribution ?? payslip.sss_deduction ?? 0);
  const philhealth = Number((payslip as any).philhealth_contrib ?? payslip.philhealth_deduction ?? 0);
  const pagibig = Number((payslip as any).pagibig_contrib ?? payslip.pagibig_deduction ?? 0);
  const withholdingTax = Number(payslip.withholding_tax || 0);
  const other = Number(payslip.other_deductions || 0);
  const grossPay = Number(payslip.gross_pay ?? (basicPay + allowances + overtimePay + bonuses));
  const totalDeductions = Number(payslip.total_deductions ?? (sss + philhealth + pagibig + withholdingTax + other));
  const netPay = Number(payslip.net_pay ?? (grossPay - totalDeductions));

  const typedPayslip: EmployeePayslip = {
    ...payslip,
    payroll_period_start: period?.period_start ?? payslip.payroll_period_start ?? "",
    payroll_period_end: period?.period_end ?? payslip.payroll_period_end ?? "",
    pay_date: period?.pay_date ?? payslip.pay_date ?? payslip.created_at ?? "",
    gross_pay: grossPay,
    basic_pay: basicPay,
    allowances: allowances,
    overtime_pay: overtimePay,
    sss_deduction: sss,
    philhealth_deduction: philhealth,
    pagibig_deduction: pagibig,
    withholding_tax: withholdingTax,
    other_deductions: other,
    total_deductions: totalDeductions,
    net_pay: netPay,
  };

  return {
    success: true,
    data: {
      payslip: typedPayslip,
      breakdown: {
        grossPay,
        basicPay,
        allowances,
        overtimePay,
        statutoryDeductions: {
          sss,
          philhealth,
          pagibig,
          withholdingTax,
          other,
          total: totalDeductions,
        },
        netPay,
      },
    },
  };
}
