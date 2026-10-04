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

  // Query published payslips ordered by pay_date DESC
  const { data: payslips, error: payslipsErr } = await admin
    .from("payslips")
    .select("*")
    .eq("employee_id", employee.id)
    .in("status", ["published", "PUBLISHED"])
    .order("pay_date", { ascending: false });

  if (payslipsErr) {
    console.error("Error fetching employee payslips:", payslipsErr);
    return { success: false, error: "Failed to fetch payslips" };
  }

  // Convert numeric types if needed and map to EmployeePayslip
  const typedPayslips: EmployeePayslip[] = (payslips || []).map((p: any) => ({
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
    .select("*, employees(id, employee_number, job_title, tenant_id, profiles(first_name, last_name, email))")
    .eq("id", payslipId)
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (payslipErr || !payslip) {
    return { success: false, error: "Payslip not found or access denied" };
  }

  const grossPay = Number(payslip.gross_pay || 0);
  const basicPay = Number(payslip.basic_pay || 0);
  const allowances = Number(payslip.allowances || 0);
  const overtimePay = Number(payslip.overtime_pay || 0);

  const sss = Number(payslip.sss_deduction || 0);
  const philhealth = Number(payslip.philhealth_deduction || 0);
  const pagibig = Number(payslip.pagibig_deduction || 0);
  const withholdingTax = Number(payslip.withholding_tax || 0);
  const other = Number(payslip.other_deductions || 0);
  const totalDeductions = Number(payslip.total_deductions || 0);

  const netPay = Number(payslip.net_pay || 0);

  const typedPayslip: EmployeePayslip = {
    ...payslip,
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
