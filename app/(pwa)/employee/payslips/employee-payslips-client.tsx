"use client";

import { useState } from "react";
import type { EmployeePayslip } from "@/lib/types";
import PayslipDetailModal from "./_components/PayslipDetailModal";

interface EmployeePayslipsClientProps {
  payslips: EmployeePayslip[];
  employeeName: string;
  employeeIdNumber: string;
  jobTitle: string;
  companyName?: string;
}

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateRange(startDateStr?: string, endDateStr?: string): string {
  if (!startDateStr || !endDateStr) return "N/A";
  const start = new Date(startDateStr).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
  const end = new Date(endDateStr).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} – ${end}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EmployeePayslipsClient({
  payslips,
  employeeName,
  employeeIdNumber,
  jobTitle,
  companyName,
}: EmployeePayslipsClientProps) {
  const [selectedPayslip, setSelectedPayslip] = useState<EmployeePayslip | null>(null);

  const latestPayslip = payslips.length > 0 ? payslips[0] : null;

  // Calculate YTD Net Pay Summary
  const ytdEarnings = payslips.reduce((sum, p) => sum + Number(p.net_pay || 0), 0);

  return (
    <div className="w-full max-w-xl min-w-0 flex flex-col mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#171542]">My Payslips</h1>
        <p className="mt-1 text-xs text-[#5d5a75]">
          View your itemized paystubs, statutory contributions, and net earnings history.
        </p>
      </div>

      {payslips.length === 0 ? (
        /* Empty State */
        <div className="rounded-3xl border border-dashed border-[#e6e4f0] bg-white p-8 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f7f6fc] text-[#1F195E]">
            <span className="material-symbols-outlined text-[32px]">payments</span>
          </div>
          <h3 className="mt-4 text-base font-bold text-[#171542]">No Payslips Issued Yet</h3>
          <p className="mt-1.5 text-xs text-[#5d5a75] leading-relaxed">
            Your itemized digital paystubs will appear here once payroll is processed by HR.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Card (Latest Net Pay & YTD Earnings) */}
          <div className="relative overflow-hidden rounded-3xl border border-[#cfcaf8] bg-gradient-to-br from-[#1F195E] via-[#2A2375] to-[#3B3293] p-6 text-white shadow-md">
            <div className="flex items-center justify-between border-b border-white/15 pb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-200">
                LATEST NET TAKE-HOME PAY
              </span>
              {latestPayslip && (
                <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-400/30">
                  PUBLISHED
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                  {latestPayslip ? formatPHP(Number(latestPayslip.net_pay)) : "₱0.00"}
                </p>
                {latestPayslip && (
                  <p className="mt-1 text-xs text-purple-200/90 font-medium">
                    Pay Period: {formatDateRange(latestPayslip.payroll_period_start, latestPayslip.payroll_period_end)}
                  </p>
                )}
              </div>

              <div className="border-t sm:border-t-0 border-white/10 pt-3 sm:pt-0 sm:text-right">
                <p className="text-[10px] uppercase font-semibold text-purple-200/80">YTD Net Earnings</p>
                <p className="text-lg font-bold text-emerald-300">{formatPHP(ytdEarnings)}</p>
              </div>
            </div>

            {latestPayslip && (
              <div className="mt-5 border-t border-white/15 pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedPayslip(latestPayslip)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#1F195E] shadow-xs transition-colors hover:bg-purple-50 active:scale-[0.99]"
                >
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  View Latest Paystub Details
                </button>
              </div>
            )}
          </div>

          {/* Historical Payslips List */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#5d5a75]">
              Payslip History ({payslips.length})
            </h2>

            <div className="space-y-3">
              {payslips.map((slip) => (
                <div
                  key={slip.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-[#e6e4f0] bg-white p-4 transition-all hover:border-[#cfcaf8] hover:shadow-xs"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-[#171542]">
                      {formatDateRange(slip.payroll_period_start, slip.payroll_period_end)}
                    </p>
                    <p className="text-xs text-[#5d5a75]">
                      Pay Date: {formatDate(slip.pay_date)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-[#171542]">
                      {formatPHP(Number(slip.net_pay))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedPayslip(slip)}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#f7f6fc] px-3 py-2 text-xs font-semibold text-[#1F195E] transition-colors hover:bg-[#e9e5ff]"
                    >
                      <span>View</span>
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Payslip Detail Drawer / Modal */}
      <PayslipDetailModal
        payslip={selectedPayslip}
        employeeName={employeeName}
        employeeIdNumber={employeeIdNumber}
        jobTitle={jobTitle}
        companyName={companyName}
        onClose={() => setSelectedPayslip(null)}
      />
    </div>
  );
}
