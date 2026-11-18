"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateEmployeeCompensationAction } from "./employee-compensation-actions";

interface CompensationEditorCardProps {
  employeeId: string;
  initialBaseSalary: number;
  initialMonthlyAllowance?: number;
  initialAttendanceIncentive?: number;
  initialPayFrequency: string;
  currency?: string;
}

export default function CompensationEditorCard({
  employeeId,
  initialBaseSalary,
  initialMonthlyAllowance = 0,
  initialAttendanceIncentive = 0,
  initialPayFrequency,
  currency = "PHP",
}: CompensationEditorCardProps) {
  const router = useRouter();
  const [baseSalary, setBaseSalary] = useState<string>(
    String(initialBaseSalary > 0 ? initialBaseSalary : 35000)
  );
  const [monthlyAllowance, setMonthlyAllowance] = useState<string>(
    String(initialMonthlyAllowance > 0 ? initialMonthlyAllowance : 0)
  );
  const [attendanceIncentive, setAttendanceIncentive] = useState<string>(
    String(initialAttendanceIncentive > 0 ? initialAttendanceIncentive : 0)
  );
  const [payFrequency, setPayFrequency] = useState<string>(
    initialPayFrequency === "semi_monthly" ? "semi_monthly" : "monthly"
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavedNotice(null);
    setErrorNotice(null);
    const formData = new FormData();
    formData.set("employee_id", employeeId);
    formData.set("base_salary", baseSalary);
    formData.set("monthly_allowance", monthlyAllowance);
    formData.set("attendance_incentive", attendanceIncentive);
    formData.set("pay_frequency", payFrequency);

    startTransition(async () => {
      const res = await updateEmployeeCompensationAction(formData);
      if (!res.ok) {
        const errText = res.error || "Failed to update compensation";
        setErrorNotice(errText);
        toast.error(errText);
        return;
      }
      const formattedSalary = Number(baseSalary).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedAllowance = (Number(monthlyAllowance) || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedIncentive = (Number(attendanceIncentive) || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const freqLabel = payFrequency === "semi_monthly" ? "semi_monthly" : "monthly";
      const summary = `Saved: ₱${formattedSalary} (${freqLabel}) | Allowance: ₱${formattedAllowance} | Attendance Incentive: ₱${formattedIncentive}`;
      const message = res.warning ? `${summary} — ${res.warning}` : summary;
      toast.success(message);
      setSavedNotice(message);
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-[#e6e4f0] bg-white p-6 shadow-xs space-y-4">
      <div className="flex flex-col gap-1 border-b border-[#e6e4f0] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-[#171542]">
            Compensation &amp; Pay Frequency
          </h2>
          <p className="text-xs text-[#5d5a75]">
            Configure monthly base salary and payroll release cadence for this employee.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-[#e6e4f0] bg-[#f7f6fc] px-3 py-1 text-[11px] font-semibold text-[#2d2b68]">
          {currency}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 sm:items-end">
        <div>
          <label
            htmlFor="base_salary"
            className="block text-xs font-semibold uppercase tracking-wider text-[#5d5a75] mb-1.5"
          >
            Monthly Base Salary (₱)
          </label>
          <input
            id="base_salary"
            name="base_salary"
            type="number"
            min={0}
            step="0.01"
            required
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            className="w-full rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3.5 py-2.5 text-sm font-semibold text-[#171542] outline-none focus:border-[#2d2b68] focus:bg-white"
          />
        </div>

        <div>
          <label
            htmlFor="monthly_allowance"
            className="block text-xs font-semibold uppercase tracking-wider text-[#5d5a75] mb-1.5"
          >
            Monthly Allowance (₱)
          </label>
          <input
            id="monthly_allowance"
            name="monthly_allowance"
            type="number"
            min={0}
            step="0.01"
            value={monthlyAllowance}
            onChange={(e) => setMonthlyAllowance(e.target.value)}
            className="w-full rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3.5 py-2.5 text-sm font-semibold text-[#171542] outline-none focus:border-[#2d2b68] focus:bg-white"
          />
        </div>

        <div>
          <label
            htmlFor="attendance_incentive"
            className="block text-xs font-semibold uppercase tracking-wider text-[#5d5a75] mb-1.5"
          >
            Perfect Attendance Incentive (₱)
          </label>
          <input
            id="attendance_incentive"
            name="attendance_incentive"
            type="number"
            min={0}
            step="0.01"
            value={attendanceIncentive}
            onChange={(e) => setAttendanceIncentive(e.target.value)}
            className="w-full rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3.5 py-2.5 text-sm font-semibold text-[#171542] outline-none focus:border-[#2d2b68] focus:bg-white"
          />
        </div>

        <div>
          <label
            htmlFor="pay_frequency"
            className="block text-xs font-semibold uppercase tracking-wider text-[#5d5a75] mb-1.5"
          >
            Pay Frequency
          </label>
          <select
            id="pay_frequency"
            name="pay_frequency"
            value={payFrequency}
            onChange={(e) => setPayFrequency(e.target.value)}
            className="w-full rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3.5 py-2.5 text-sm font-semibold text-[#171542] outline-none focus:border-[#2d2b68] focus:bg-white"
          >
            <option value="monthly">Monthly</option>
            <option value="semi_monthly">Semi-Monthly</option>
          </select>
        </div>

        <div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-[#2d2b68] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1e1b4b] disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Compensation"}
          </button>
        </div>
      </form>

      {errorNotice && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800"
        >
          {errorNotice}
        </div>
      )}

      {savedNotice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800"
        >
          {savedNotice}
        </div>
      )}
    </section>
  );
}
