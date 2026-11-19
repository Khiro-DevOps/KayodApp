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

function formatFrequencyLabel(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower === "semi_monthly" || lower === "semi-monthly") return "Semi-Monthly";
  if (lower === "biweekly" || lower === "bi-weekly") return "Biweekly";
  if (lower === "monthly") return "Monthly";
  if (lower === "weekly") return "Weekly";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPesoTokens(text: string): string {
  return text.replace(/₱(\d+(?:\.\d{1,2})?)/g, (_, numStr: string) => {
    const num = Number(numStr);
    if (!Number.isFinite(num)) return `₱${numStr}`;
    return `₱${num.toLocaleString("en-PH", {
      minimumFractionDigits: numStr.includes(".") ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  });
}

type BreakdownItem = {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "warning" | "deduction";
};

function parseComputationBreakdown(rawRemarks: string): BreakdownItem[] {
  const segments = rawRemarks
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const items: BreakdownItem[] = [];

  for (const seg of segments) {
    const demoMatch = seg.match(/^Demo Computation\s*\(([^)]+)\)$/i);
    if (demoMatch) {
      items.push({
        label: "Pay Cycle",
        value: formatFrequencyLabel(demoMatch[1]),
        tone: "neutral",
      });
      continue;
    }

    // Hide zero-value noise segments (OT 0.00h, Night Diff 0.00h, Late 0m, Absent 0d)
    if (
      /^OT:\s*0(?:\.0+)?h\s*\(₱0(?:\.0+)?\)$/i.test(seg) ||
      /^Night Diff:\s*0(?:\.0+)?h\s*\(₱0(?:\.0+)?\)$/i.test(seg) ||
      /^Late:\s*0m\s*\(-?₱0(?:\.0+)?\)$/i.test(seg) ||
      /^Absent:\s*0d\s*\(-?₱0(?:\.0+)?\)$/i.test(seg)
    ) {
      continue;
    }

    const colonIdx = seg.indexOf(":");
    if (colonIdx > 0) {
      const label = seg.slice(0, colonIdx).trim();
      const value = formatPesoTokens(seg.slice(colonIdx + 1).trim());
      const lowerLabel = label.toLowerCase();
      const tone: BreakdownItem["tone"] =
        lowerLabel.includes("late") ||
        lowerLabel.includes("absent") ||
        lowerLabel.includes("overbreak") ||
        lowerLabel.includes("deduction")
          ? "deduction"
          : lowerLabel.includes("allowance") ||
              lowerLabel.includes("incentive") ||
              lowerLabel.includes("ot") ||
              lowerLabel.includes("night diff")
            ? "positive"
            : "neutral";
      items.push({ label, value, tone });
      continue;
    }

    const formatted = formatPesoTokens(seg);
    const lowerSeg = formatted.toLowerCase();
    const tone: BreakdownItem["tone"] = lowerSeg.includes("forfeited")
      ? "warning"
      : lowerSeg.includes("earned") || lowerSeg.includes("prorated")
        ? "positive"
        : "neutral";
    items.push({ label: "Note", value: formatted, tone });
  }

  return items;
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
  const bonuses = Number(payslip.bonuses || 0);

  const sss = Number(payslip.sss_deduction || 0);
  const philhealth = Number(payslip.philhealth_deduction || 0);
  const pagibig = Number(payslip.pagibig_deduction || 0);
  const tax = Number(payslip.withholding_tax || 0);
  const other = Number(payslip.other_deductions || 0);
  const totalDeductions = Number(payslip.total_deductions || 0);
  const netPay = Number(payslip.net_pay || 0);
  const remarks = payslip.remarks ?? null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
      <div className="relative max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 sm:p-6 shadow-2xl print:max-h-none print:w-full print:max-w-none print:rounded-none print:p-0 print:shadow-none">
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
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <span className="inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 border border-amber-200">
                  Demo Payroll Computation
                </span>
                <span className="inline-block rounded-full bg-purple-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-purple-900 border border-purple-200">
                  {String(payslip.status) === "published" || String(payslip.status) === "paid" ? "PUBLISHED" : "DRAFT"}
                </span>
              </div>
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
                  <span className="text-[#5d5a75]">Overtime (Lenient 1.25x)</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(overtimePay)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Night Diff / Bonuses</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(bonuses)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Allowances</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(allowances)}</span>
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
                  <span className="text-[#5d5a75]">SSS</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(sss)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">PhilHealth</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(philhealth)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Pag-IBIG</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(pagibig)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Withholding Tax</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(tax)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5d5a75]">Late &amp; Absence / Other Deductions</span>
                  <span className="font-semibold text-[#171542]">{formatPHP(other)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-[#e6e4f0] pt-2 font-bold">
                  <span className="text-[#171542] uppercase text-[11px]">Total Deductions</span>
                  <span className="text-rose-600 font-extrabold text-sm">-{formatPHP(totalDeductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {remarks && (() => {
            const breakdownItems = parseComputationBreakdown(remarks);
            if (breakdownItems.length === 0) return null;
            return (
              <div className="rounded-2xl border border-[#e6e4f0] bg-[#f7f6fc] p-4 text-xs space-y-2.5">
                <p className="font-bold uppercase tracking-wider text-[11px] text-[#171542]">
                  Computation Breakdown
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {breakdownItems.map((item, idx) => {
                    const pillClass =
                      item.tone === "positive"
                        ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                        : item.tone === "deduction"
                          ? "border-rose-200 bg-rose-50/70 text-rose-900"
                          : item.tone === "warning"
                            ? "border-amber-200 bg-amber-50/70 text-amber-900"
                            : "border-[#e6e4f0] bg-white text-[#171542]";
                    return (
                      <div
                        key={`${item.label}-${idx}`}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${pillClass}`}
                      >
                        <span className="font-semibold opacity-80 shrink-0">{item.label}</span>
                        <span className="font-bold text-right">{item.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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
