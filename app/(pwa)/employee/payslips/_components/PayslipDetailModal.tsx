"use client";

import { useState } from "react";
import type { EmployeePayslip } from "@/lib/types";

interface PayslipDetailModalProps {
  payslip: EmployeePayslip | null;
  employeeName: string;
  employeeIdNumber: string;
  jobTitle: string;
  companyName?: string;
  onClose: () => void;
}

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

export default function PayslipDetailModal({
  payslip,
  employeeName,
  employeeIdNumber,
  jobTitle,
  companyName = "Kayod Corporation",
  onClose,
}: PayslipDetailModalProps) {
  if (!payslip) return null;

  const grossPay = Number(payslip.gross_pay || 0);
  const basicPay = Number(payslip.basic_pay || 0);
  const allowances = Number(payslip.allowances || 0);
  const overtimePay = Number(payslip.overtime_pay || 0);

  const sss = Number(payslip.sss_deduction || 0);
  const philhealth = Number(payslip.philhealth_deduction || 0);
  const pagibig = Number(payslip.pagibig_deduction || 0);
  const tax = Number(payslip.withholding_tax || 0);
  const other = Number(payslip.other_deductions || 0);
  const totalDeductions = Number(payslip.total_deductions || 0);
  const netPay = Number(payslip.net_pay || 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl print:max-h-none print:w-full print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        {/* Modal Top Header Actions (hidden when printing) */}
        <div className="flex items-center justify-between border-b border-[#e6e4f0] pb-4 print:hidden">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#1F195E]">receipt_long</span>
            <h2 className="text-lg font-bold text-[#171542]">Itemized Paystub</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3.5 py-1.5 text-xs font-semibold text-[#171542] transition-colors hover:bg-[#e9e5ff]"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#5d5a75] transition-colors hover:bg-[#f7f6fc]"
              aria-label="Close modal"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Digital Itemized Paystub Document */}
        <div className="mt-4 space-y-6 print:mt-0">
          {/* Paystub Header */}
          <div className="flex flex-col justify-between gap-4 border-b border-[#e6e4f0] pb-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-[#1F195E] uppercase">{companyName}</h3>
              <p className="text-xs text-[#5d5a75]">Official Itemized Employee Payslip</p>
            </div>
            <div className="sm:text-right">
              <span className="inline-block rounded-full bg-purple-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-purple-900 border border-purple-200">
                {payslip.status === "published" ? "PUBLISHED" : "DRAFT"}
              </span>
              <p className="mt-1 text-xs text-[#5d5a75]">
                Pay Date: <span className="font-semibold text-gray-900">{formatDate(payslip.pay_date)}</span>
              </p>
            </div>
          </div>

          {/* Metadata Grid */}
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
              <p className="font-semibold text-[#5d5a75]">Job Title</p>
              <p className="mt-0.5 font-bold text-[#171542]">{jobTitle}</p>
            </div>
            <div>
              <p className="font-semibold text-[#5d5a75]">Pay Period</p>
              <p className="mt-0.5 font-bold text-[#171542]">
                {formatDateRange(payslip.payroll_period_start, payslip.payroll_period_end)}
              </p>
            </div>
          </div>

          {/* Itemized Columns: Earnings & Deductions */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Earnings Column */}
            <div className="space-y-3 rounded-2xl border border-[#e6e4f0] bg-white p-4">
              <div className="border-b border-[#e6e4f0] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Earnings Breakdown
                </h4>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Basic Pay</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(basicPay)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Allowances</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(allowances)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Overtime Pay</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(overtimePay)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-[#e6e4f0] pt-2 font-bold">
                  <span className="text-[#171542] uppercase text-[11px]">Gross Pay</span>
                  <span className="text-emerald-700 font-extrabold text-sm">{formatPHP(grossPay)}</span>
                </div>
              </div>
            </div>

            {/* Deductions Column */}
            <div className="space-y-3 rounded-2xl border border-[#e6e4f0] bg-white p-4">
              <div className="border-b border-[#e6e4f0] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800">
                  Deductions Breakdown
                </h4>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">SSS Deduction</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(sss)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">PhilHealth Deduction</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(philhealth)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Pag-IBIG Deduction</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(pagibig)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Withholding Tax</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(tax)}</span>
                </div>
                {other > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[#5d5a75]">Other Deductions</span>
                    <span className="font-semibold text-[#171542]">{formatPHP(other)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-[#e6e4f0] pt-2 font-bold">
                  <span className="text-[#171542] uppercase text-[11px]">Total Deductions</span>
                  <span className="text-rose-600 font-extrabold text-sm">-{formatPHP(totalDeductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Highlight Footer: NET TAKE-HOME PAY (purple background) */}
          <div className="rounded-2xl bg-[#1F195E] p-5 text-white shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-purple-200">
                  NET TAKE-HOME PAY
                </p>
                <p className="text-[11px] text-purple-100/80">
                  Gross Pay ({formatPHP(grossPay)}) - Total Deductions ({formatPHP(totalDeductions)})
                </p>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white">
                {formatPHP(netPay)}
              </p>
            </div>
          </div>

          {/* Computer Generated Footer Note */}
          <p className="text-center text-[10px] text-[#5d5a75] print:block">
            This is a computer-generated payslip from Kayod HRIS platform. No physical signature is required.
          </p>
        </div>
      </div>
    </div>
  );
}
