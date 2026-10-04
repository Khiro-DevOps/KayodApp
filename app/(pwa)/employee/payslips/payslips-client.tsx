"use client";

import { useState } from "react";
import PageContainer from "@/components/ui/page-container";
import type { Payslip, PayrollPeriod, Employee, Profile } from "@/lib/types";

export type EmployeePayslipItem = Payslip & {
  payroll_periods: PayrollPeriod | null;
  employees: (Employee & { profiles: Profile | null }) | null;
};

interface PayslipsClientViewProps {
  payslips: EmployeePayslipItem[];
  employeeName: string;
  employeeIdNumber: string;
  jobTitle: string;
}

function formatPeso(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateRange(startDateStr?: string, endDateStr?: string) {
  if (!startDateStr || !endDateStr) return "N/A";
  const start = new Date(startDateStr).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
  const end = new Date(startDateStr).getFullYear() === new Date(endDateStr).getFullYear()
    ? new Date(endDateStr).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : new Date(endDateStr).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  return `${start} – ${end}`;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PayslipsClientView({
  payslips,
  employeeName,
  employeeIdNumber,
  jobTitle,
}: PayslipsClientViewProps) {
  const [selectedPayslip, setSelectedPayslip] = useState<EmployeePayslipItem | null>(null);

  const latestPayslip = payslips.length > 0 ? payslips[0] : null;
  const historyPayslips = payslips;

  return (
    <PageContainer>
      <div className="space-y-6">
        {payslips.length === 0 ? (
          /* Empty State */
          <div className="w-full max-w-md mx-auto text-center p-6 space-y-2 rounded-3xl border border-dashed border-[#e6e4f0] bg-white shadow-[0_12px_30px_rgba(39,36,84,0.04)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f7f6fc] text-[#2d2b68]">
              <span className="material-symbols-outlined text-[32px]">payments</span>
            </div>
            <h3 className="font-bold text-gray-900 text-lg">No payslips available yet</h3>
            <p className="text-sm text-gray-500 leading-relaxed w-full max-w-sm mx-auto block whitespace-normal">
              Once HR processes payroll for your pay periods, your itemized statements will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Section 1: Latest Payroll Hero Banner (Light Purple Gradient) */}
            {latestPayslip && (
              <div className="relative overflow-hidden rounded-3xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-purple-100/50 p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-100 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-900">LATEST PAYROLL PERIOD</span>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 border border-emerald-200">
                    PAID / DEPOSITED
                  </span>
                </div>

                <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:items-end">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">NET TAKE HOME PAY</p>
                    <p className="mt-1 text-3xl md:text-4xl font-black tracking-tight text-gray-900">
                      {formatPeso(Number(latestPayslip.net_pay))}
                    </p>
                    <p className="mt-1 text-xs font-medium text-gray-600">
                      Pay Period: {formatDateRange(
                        latestPayslip.payroll_periods?.period_start,
                        latestPayslip.payroll_periods?.period_end
                      )}
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPayslip(latestPayslip);
                        setTimeout(() => window.print(), 300);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#2d2b68] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2A2375] active:scale-[0.98]"
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                      Download PDF Payslip
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Section 2: 2-Column Earnings vs Deductions Breakdown Grid */}
            {latestPayslip && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Gross Earnings Card */}
                <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-[#e6e4f0] pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-800">Gross Earnings</h3>
                    <span className="material-symbols-outlined text-[20px] text-emerald-600">add_card</span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">Basic Salary</span>
                      <span className="font-semibold text-gray-900">{formatPeso(Number(latestPayslip.basic_pay || 0))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">Overtime (OT)</span>
                      <span className="font-semibold text-gray-900">{formatPeso(Number(latestPayslip.overtime_pay || 0))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">Holiday Pay / Bonuses</span>
                      <span className="font-semibold text-gray-900">{formatPeso(Number(latestPayslip.bonuses || 0))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">Allowances</span>
                      <span className="font-semibold text-gray-900">{formatPeso(Number(latestPayslip.allowances || 0))}</span>
                    </div>
                  </div>

                  <div className="border-t border-[#e6e4f0] pt-3 flex justify-between items-center font-bold text-sm">
                    <span className="text-gray-900 uppercase text-xs tracking-wider">TOTAL GROSS</span>
                    <span className="text-emerald-700 font-extrabold">{formatPeso(Number(latestPayslip.gross_pay || 0))}</span>
                  </div>
                </div>

                {/* Deductions Card */}
                <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-[#e6e4f0] pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-rose-800">Deductions</h3>
                    <span className="material-symbols-outlined text-[20px] text-rose-600">remove_card</span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">SSS Contribution</span>
                      <span className="font-semibold text-gray-900">{formatPeso(Number(latestPayslip.sss_contribution || 0))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">PhilHealth</span>
                      <span className="font-semibold text-gray-900">{formatPeso(Number(latestPayslip.philhealth_contrib || 0))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">Pag-IBIG</span>
                      <span className="font-semibold text-gray-900">{formatPeso(Number(latestPayslip.pagibig_contrib || 0))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">Withholding Tax</span>
                      <span className="font-semibold text-gray-900">{formatPeso(Number(latestPayslip.withholding_tax || 0))}</span>
                    </div>
                  </div>

                  <div className="border-t border-[#e6e4f0] pt-3 flex justify-between items-center font-bold text-sm">
                    <span className="text-gray-900 uppercase text-xs tracking-wider">TOTAL DEDUCTIONS</span>
                    <span className="text-rose-600 font-extrabold">-{formatPeso(Number(latestPayslip.total_deductions || 0))}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Past Payslips History List */}
            <div className="space-y-4 pt-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">PAST PAYSLIP HISTORY</h2>

              <div className="grid gap-3">
                {historyPayslips.map((slip) => {
                  const net = Number(slip.net_pay || 0);

                  return (
                    <div
                      key={slip.id}
                      className="group flex flex-col justify-between gap-4 rounded-2xl border border-[#e6e4f0] bg-white p-4 transition-all duration-200 hover:border-[#cfcaf8] hover:shadow-xs sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">
                            {formatDateRange(
                              slip.payroll_periods?.period_start,
                              slip.payroll_periods?.period_end
                            )}
                          </p>
                          <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                            PAID
                          </span>
                        </div>
                        <p className="text-xs text-[#5d5a75]">
                          Pay Date: {formatDate(slip.payroll_periods?.pay_date)}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-6 sm:justify-end">
                        <p className="text-base font-bold text-gray-900">
                          {formatPeso(net)}
                        </p>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPayslip(slip);
                            setTimeout(() => window.print(), 300);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f7f6fc] text-[#2d2b68] transition-colors group-hover:bg-[#e9e5ff]"
                          title="Download PDF"
                        >
                          <span className="material-symbols-outlined text-[20px]">download</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Payslip Detail Breakdown Modal */}
        {selectedPayslip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl print:max-h-none print:w-full print:max-w-none print:rounded-none print:p-0 print:shadow-none">
              
              {/* Modal Header Actions */}
              <div className="flex items-center justify-between border-b border-[#e6e4f0] pb-4 print:hidden">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#2d2b68]">receipt_long</span>
                  <h2 className="text-lg font-bold text-[#171542]">Payslip Breakdown</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3 py-1.5 text-xs font-semibold text-[#171542] hover:bg-[#e9e5ff]"
                  >
                    <span className="material-symbols-outlined text-[16px]">print</span>
                    Print / Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPayslip(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[#5d5a75] hover:bg-[#f7f6fc]"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
              </div>

              {/* Printable Statement Document */}
              <div className="mt-4 space-y-6 print:mt-0">
                {/* Company & Statement Title */}
                <div className="flex flex-col justify-between gap-4 border-b border-[#e6e4f0] pb-4 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-[#1F195E]">KAYOD HRIS</h3>
                    <p className="text-xs text-[#5d5a75]">Official Payroll Statement</p>
                  </div>
                  <div className="sm:text-right">
                    <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-800">
                      {selectedPayslip.status === "paid" ? "PAID" : "PROCESSED"}
                    </span>
                    <p className="mt-1 text-xs text-[#5d5a75]">
                      Issued: {formatDate(selectedPayslip.payroll_periods?.pay_date)}
                    </p>
                  </div>
                </div>

                {/* Employee Info Header */}
                <div className="grid grid-cols-2 gap-4 rounded-2xl bg-[#f7f6fc] p-4 text-xs sm:grid-cols-4">
                  <div>
                    <p className="font-semibold text-[#5d5a75]">Employee Name</p>
                    <p className="mt-0.5 font-bold text-[#171542]">{employeeName}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[#5d5a75]">Employee ID</p>
                    <p className="mt-0.5 font-bold text-[#171542]">{employeeIdNumber}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[#5d5a75]">Position</p>
                    <p className="mt-0.5 font-bold text-[#171542]">{jobTitle}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[#5d5a75]">Pay Period</p>
                    <p className="mt-0.5 font-bold text-[#171542]">
                      {formatDateRange(
                        selectedPayslip.payroll_periods?.period_start,
                        selectedPayslip.payroll_periods?.period_end
                      )}
                    </p>
                  </div>
                </div>

                {/* Itemized Columns: Earnings & Deductions */}
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Earnings Column */}
                  <div className="space-y-3">
                    <div className="border-b border-[#e6e4f0] pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                        Earnings Breakdown
                      </h4>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#5d5a75]">Basic Pay</span>
                        <span className="font-semibold text-[#171542]">{formatPeso(Number(selectedPayslip.basic_pay || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5d5a75]">Overtime Pay</span>
                        <span className="font-semibold text-[#171542]">{formatPeso(Number(selectedPayslip.overtime_pay || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5d5a75]">Allowances</span>
                        <span className="font-semibold text-[#171542]">{formatPeso(Number(selectedPayslip.allowances || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5d5a75]">Bonuses</span>
                        <span className="font-semibold text-[#171542]">{formatPeso(Number(selectedPayslip.bonuses || 0))}</span>
                      </div>
                      <div className="flex justify-between border-t border-[#e6e4f0] pt-2 font-bold">
                        <span className="text-[#171542]">Total Gross Earnings</span>
                        <span className="text-emerald-700">{formatPeso(Number(selectedPayslip.gross_pay || 0))}</span>
                      </div>
                    </div>
                  </div>

                  {/* Deductions Column */}
                  <div className="space-y-3">
                    <div className="border-b border-[#e6e4f0] pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700">
                        Deductions Breakdown
                      </h4>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#5d5a75]">Withholding Tax</span>
                        <span className="font-semibold text-[#171542]">{formatPeso(Number(selectedPayslip.withholding_tax || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5d5a75]">SSS Contribution</span>
                        <span className="font-semibold text-[#171542]">{formatPeso(Number(selectedPayslip.sss_contribution || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5d5a75]">PhilHealth Contribution</span>
                        <span className="font-semibold text-[#171542]">{formatPeso(Number(selectedPayslip.philhealth_contrib || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5d5a75]">Pag-IBIG Contribution</span>
                        <span className="font-semibold text-[#171542]">{formatPeso(Number(selectedPayslip.pagibig_contrib || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5d5a75]">Other Deductions</span>
                        <span className="font-semibold text-[#171542]">{formatPeso(Number(selectedPayslip.other_deductions || 0))}</span>
                      </div>
                      <div className="flex justify-between border-t border-[#e6e4f0] pt-2 font-bold">
                        <span className="text-[#171542]">Total Deductions</span>
                        <span className="text-rose-700">-{formatPeso(Number(selectedPayslip.total_deductions || 0))}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Net Payable Summary */}
                <div className="rounded-2xl border border-[#cfcaf8] bg-[#f7f6fc] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#5d5a75]">
                        Net Payable Amount
                      </p>
                      <p className="text-[11px] text-[#5d5a75]">
                        Gross Earnings (₱{Number(selectedPayslip.gross_pay || 0).toLocaleString()}) - Total Deductions (₱{Number(selectedPayslip.total_deductions || 0).toLocaleString()})
                      </p>
                    </div>
                    <p className="text-2xl font-black text-[#1F195E]">
                      {formatPeso(Number(selectedPayslip.net_pay || 0))}
                    </p>
                  </div>
                  {selectedPayslip.remarks && (
                    <div className="mt-3 border-t border-[#e6e4f0] pt-2 text-xs text-[#5d5a75]">
                      <span className="font-semibold">Remarks:</span> {selectedPayslip.remarks}
                    </div>
                  )}
                </div>

                {/* Footer Note */}
                <p className="text-center text-[10px] text-[#5d5a75] print:block">
                  This is a computer-generated payslip from Kayod HRIS system. No signature is required.
                </p>
              </div>

            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
