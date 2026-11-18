"use client";

import { useState } from "react";
import {
  computeCompensationTotals,
  createDefaultCompensationPackage,
  formatPhp,
  type HmoTiming,
  type PhilippineCompensationPackage,
} from "@/lib/compensation-package";

interface PhilippineCompensationChecklistProps {
  value?: PhilippineCompensationPackage;
  onChange?: (next: PhilippineCompensationPackage) => void;
  hiddenInputName?: string;
  allowCustomItems?: boolean;
  baseSalary?: number;
}

type AllowanceKey =
  | "rice_allowance"
  | "transport_allowance"
  | "internet_allowance"
  | "meal_allowance"
  | "clothing_allowance";

const ALLOWANCE_ITEMS: Array<{ key: AllowanceKey; label: string; hint: string }> = [
  { key: "rice_allowance", label: "Rice Subsidy", hint: "De minimis monthly rice benefit" },
  { key: "transport_allowance", label: "Transportation / Fuel Allowance", hint: "Commute or fuel support" },
  { key: "internet_allowance", label: "Communication / Internet Allowance", hint: "Connectivity & mobile" },
  { key: "meal_allowance", label: "Meal Allowance", hint: "Daily meal subsidy" },
  { key: "clothing_allowance", label: "Clothing / Uniform Allowance", hint: "Annualized monthly uniform" },
];

export default function PhilippineCompensationChecklist({
  value,
  onChange,
  hiddenInputName,
  allowCustomItems = true,
  baseSalary = 0,
}: PhilippineCompensationChecklistProps) {
  const [internalPkg, setInternalPkg] = useState<PhilippineCompensationPackage>(
    () => value ?? createDefaultCompensationPackage()
  );
  const [customLabel, setCustomLabel] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customKind, setCustomKind] = useState<"allowance" | "incentive">("allowance");

  const pkg = value ?? internalPkg;

  const updatePkg = (updater: (prev: PhilippineCompensationPackage) => PhilippineCompensationPackage) => {
    const next = updater(pkg);
    if (!value) {
      setInternalPkg(next);
    }
    onChange?.(next);
  };

  const totals = computeCompensationTotals(pkg, baseSalary);

  const handleAddCustomItem = () => {
    const label = customLabel.trim();
    const amount = Math.max(0, Number(customAmount) || 0);
    if (!label || amount <= 0) return;

    updatePkg((prev) => ({
      ...prev,
      custom_items: [
        ...prev.custom_items,
        {
          id: `custom-${Date.now()}`,
          label,
          amount,
          kind: customKind,
          enabled: true,
        },
      ],
    }));
    setCustomLabel("");
    setCustomAmount("");
  };

  return (
    <div className="space-y-4">
      {hiddenInputName ? (
        <input type="hidden" name={hiddenInputName} value={JSON.stringify(pkg)} />
      ) : null}

      {/* De Minimis & Recurring Monthly Allowances */}
      <div className="space-y-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          De Minimis &amp; Recurring Monthly Allowances
        </p>
        <div className="space-y-2">
          {ALLOWANCE_ITEMS.map((item) => {
            const state = pkg[item.key];
            return (
              <div
                key={item.key}
                className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors ${
                  state.enabled
                    ? "border-indigo-200 bg-indigo-50/50"
                    : "border-slate-200 bg-slate-50/40"
                }`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={state.enabled}
                    onChange={(e) =>
                      updatePkg((prev) => ({
                        ...prev,
                        [item.key]: { ...prev[item.key], enabled: e.target.checked },
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-900">{item.label}</span>
                    <span className="block text-[10px] text-slate-500">{item.hint}</span>
                  </div>
                </label>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs font-semibold text-slate-500">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={state.amount}
                    disabled={!state.enabled}
                    onChange={(e) =>
                      updatePkg((prev) => ({
                        ...prev,
                        [item.key]: {
                          ...prev[item.key],
                          amount: Math.max(0, Number(e.target.value) || 0),
                        },
                      }))
                    }
                    className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Performance & Statutory Incentives */}
      <div className="space-y-2.5 pt-2 border-t border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Performance &amp; Statutory Incentives
        </p>

        {/* Perfect Attendance */}
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors ${
            pkg.attendance_incentive.enabled
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-slate-200 bg-slate-50/40"
          }`}
        >
          <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
            <input
              type="checkbox"
              checked={pkg.attendance_incentive.enabled}
              onChange={(e) =>
                updatePkg((prev) => ({
                  ...prev,
                  attendance_incentive: {
                    ...prev.attendance_incentive,
                    enabled: e.target.checked,
                  },
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-slate-900">
                Perfect Attendance / Punctuality Incentive
              </span>
              <span className="block text-[10px] text-slate-500">
                Auto-awarded when 0 lates &amp; 0 absences
              </span>
            </div>
          </label>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs font-semibold text-slate-500">₱</span>
            <input
              type="number"
              min="0"
              step="100"
              value={pkg.attendance_incentive.amount}
              disabled={!pkg.attendance_incentive.enabled}
              onChange={(e) =>
                updatePkg((prev) => ({
                  ...prev,
                  attendance_incentive: {
                    ...prev.attendance_incentive,
                    amount: Math.max(0, Number(e.target.value) || 0),
                  },
                }))
              }
              className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>

        {/* Performance / KPI Bonus */}
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors ${
            pkg.performance_bonus.enabled
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-slate-200 bg-slate-50/40"
          }`}
        >
          <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
            <input
              type="checkbox"
              checked={pkg.performance_bonus.enabled}
              onChange={(e) =>
                updatePkg((prev) => ({
                  ...prev,
                  performance_bonus: {
                    ...prev.performance_bonus,
                    enabled: e.target.checked,
                  },
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-slate-900">
                Performance / KPI Bonus
              </span>
              <span className="block text-[10px] text-slate-500">Monthly target incentive</span>
            </div>
          </label>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs font-semibold text-slate-500">₱</span>
            <input
              type="number"
              min="0"
              step="100"
              value={pkg.performance_bonus.amount}
              disabled={!pkg.performance_bonus.enabled}
              onChange={(e) =>
                updatePkg((prev) => ({
                  ...prev,
                  performance_bonus: {
                    ...prev.performance_bonus,
                    amount: Math.max(0, Number(e.target.value) || 0),
                  },
                }))
              }
              className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>

        {/* 13th Month Pay */}
        <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 cursor-pointer">
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={pkg.thirteenth_month_pay}
              onChange={(e) =>
                updatePkg((prev) => ({ ...prev, thirteenth_month_pay: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="block text-xs font-semibold text-slate-900">
                13th-Month Pay (Mandatory PD 851)
              </span>
              <span className="block text-[10px] text-slate-500">
                Statutory 1/12 of annual basic pay
              </span>
            </div>
          </div>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
            Statutory
          </span>
        </label>

        {/* HMO / Medical Coverage */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={pkg.hmo_coverage.enabled}
              onChange={(e) =>
                updatePkg((prev) => ({
                  ...prev,
                  hmo_coverage: { ...prev.hmo_coverage, enabled: e.target.checked },
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-semibold text-slate-900">HMO / Medical Coverage</span>
          </label>
          {pkg.hmo_coverage.enabled && (
            <div className="flex items-center gap-2 pl-6">
              {(
                [
                  { value: "day_1", label: "Day 1" },
                  { value: "upon_regularization", label: "Upon Regularization" },
                ] as Array<{ value: HmoTiming; label: string }>
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    updatePkg((prev) => ({
                      ...prev,
                      hmo_coverage: { ...prev.hmo_coverage, timing: opt.value },
                    }))
                  }
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    pkg.hmo_coverage.timing === opt.value
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Custom Items */}
      {pkg.custom_items.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Custom Allowances &amp; Incentives
          </p>
          {pkg.custom_items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2"
            >
              <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(e) =>
                    updatePkg((prev) => ({
                      ...prev,
                      custom_items: prev.custom_items.map((c) =>
                        c.id === item.id ? { ...c, enabled: e.target.checked } : c
                      ),
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="text-xs font-semibold text-slate-800 truncate">{item.label}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {item.kind}
                </span>
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">₱{item.amount.toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() =>
                    updatePkg((prev) => ({
                      ...prev,
                      custom_items: prev.custom_items.filter((c) => c.id !== item.id),
                    }))
                  }
                  className="text-xs font-semibold text-rose-500 hover:text-rose-700 px-1"
                  aria-label={`Remove ${item.label}`}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {allowCustomItems && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <p className="text-[11px] font-semibold text-slate-500">Add Custom Allowance / Incentive</p>
          <div className="flex flex-wrap gap-1.5">
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="e.g. Laundry Allowance"
              className="min-w-[120px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            />
            <input
              type="number"
              min="0"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="₱"
              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
            />
            <select
              value={customKind}
              onChange={(e) => setCustomKind(e.target.value as "allowance" | "incentive")}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
            >
              <option value="allowance">Allowance</option>
              <option value="incentive">Incentive</option>
            </select>
            <button
              type="button"
              onClick={handleAddCustomItem}
              className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200"
            >
              + Add
            </button>
          </div>
        </div>
      )}

      {/* Package Summary */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
        <div className="flex items-center justify-between text-slate-600">
          <span>Monthly Allowances</span>
          <span className="font-semibold text-slate-900">{formatPhp(totals.monthlyAllowancesTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>Monthly Incentives</span>
          <span className="font-semibold text-slate-900">{formatPhp(totals.monthlyIncentivesTotal)}</span>
        </div>
        {baseSalary > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
            <span>Total Monthly Package</span>
            <span>{formatPhp(totals.totalMonthlyPackage)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
