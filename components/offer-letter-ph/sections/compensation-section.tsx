"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import type { CompensationType } from "@/lib/schemas/offer-letter-ph";

interface CompensationSectionProps {
  initialValues: Partial<CompensationType>;
  onChange: (values: Partial<CompensationType>) => void;
  formRef?: React.RefObject<HTMLFormElement>;
}

export default function CompensationSection({
  initialValues,
  onChange,
  formRef,
}: CompensationSectionProps) {
  const handleChange = (field: keyof CompensationType, value: any) => {
    const updatedValues = {
      ...initialValues,
      [field]: value,
    };
    onChange(updatedValues);
  };

  const monthlyBasicSalary = initialValues.monthlyBasicSalary || 0;
  const payFrequency = initialValues.payFrequency || "monthly";
  const mandatory13thMonth = initialValues.mandatory13thMonth !== false;
  const performanceBonus = initialValues.performanceBonus ?? "";
  const signingBonus = initialValues.signingBonus ?? "";
  const commissionStructure = initialValues.commissionStructure || "";
  const transportAllowance = initialValues.transportAllowance ?? "";
  const mealAllowance = initialValues.mealAllowance ?? "";
  const nightDifferential = initialValues.nightDifferential ?? "";

  const minimumNightDifferential = Math.max(monthlyBasicSalary * 0.1, 0);

  return (
    <div className="space-y-4">
      {/* Basic Compensation */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="compensation.monthlyBasicSalary"
            className="block text-sm font-medium text-gray-900"
          >
            Monthly Basic Salary (PHP) <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              ₱
            </span>
            <input
              type="number"
              id="compensation.monthlyBasicSalary"
              name="compensation.monthlyBasicSalary"
              value={monthlyBasicSalary}
              onChange={(e) =>
                handleChange("monthlyBasicSalary", parseFloat(e.target.value))
              }
              min="0"
              step="0.01"
              className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="compensation.payFrequency"
            className="block text-sm font-medium text-gray-900"
          >
            Pay Frequency <span className="text-red-600">*</span>
          </label>
          <select
            id="compensation.payFrequency"
            name="compensation.payFrequency"
            value={payFrequency}
            onChange={(e) => handleChange("payFrequency", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="monthly">Monthly</option>
            <option value="semi_monthly">Semi-monthly (15th & 30th)</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      {/* 13th Month Pay */}
      <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <input
          type="checkbox"
          id="compensation.mandatory13thMonth"
          name="compensation.mandatory13thMonth"
          checked={mandatory13thMonth}
          onChange={(e) => handleChange("mandatory13thMonth", e.target.checked)}
          className="mt-1 cursor-pointer rounded border-gray-300 accent-primary"
        />
        <label
          htmlFor="compensation.mandatory13thMonth"
          className="flex flex-1 flex-col gap-1 cursor-pointer"
        >
          <span className="font-medium text-gray-900">
            13th Month Pay
          </span>
          <span className="text-xs text-gray-600">
            Required by P.D. 851 (Presidential Decree No. 851). This entitlement
            is mandatory.
          </span>
        </label>
      </div>

      {/* Additional Compensation */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-900">
          Additional Compensation (Optional)
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="compensation.performanceBonus"
              className="block text-sm font-medium text-gray-900"
            >
              Performance Bonus (PHP)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                ₱
              </span>
              <input
                type="number"
                id="compensation.performanceBonus"
                name="compensation.performanceBonus"
                value={performanceBonus}
                onChange={(e) =>
                  handleChange(
                    "performanceBonus",
                    e.target.value ? parseFloat(e.target.value) : null
                  )
                }
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="compensation.signingBonus"
              className="block text-sm font-medium text-gray-900"
            >
              Signing Bonus (PHP)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                ₱
              </span>
              <input
                type="number"
                id="compensation.signingBonus"
                name="compensation.signingBonus"
                value={signingBonus}
                onChange={(e) =>
                  handleChange(
                    "signingBonus",
                    e.target.value ? parseFloat(e.target.value) : null
                  )
                }
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="compensation.commissionStructure"
            className="block text-sm font-medium text-gray-900"
          >
            Commission Structure
          </label>
          <input
            type="text"
            id="compensation.commissionStructure"
            name="compensation.commissionStructure"
            value={commissionStructure}
            onChange={(e) => handleChange("commissionStructure", e.target.value)}
            placeholder="e.g., 5% of sales; tiered commission based on targets"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="compensation.transportAllowance"
              className="block text-sm font-medium text-gray-900"
            >
              Transport Allowance (PHP)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                ₱
              </span>
              <input
                type="number"
                id="compensation.transportAllowance"
                name="compensation.transportAllowance"
                value={transportAllowance}
                onChange={(e) =>
                  handleChange(
                    "transportAllowance",
                    e.target.value ? parseFloat(e.target.value) : null
                  )
                }
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="compensation.mealAllowance"
              className="block text-sm font-medium text-gray-900"
            >
              Meal Allowance (PHP/Day)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                ₱
              </span>
              <input
                type="number"
                id="compensation.mealAllowance"
                name="compensation.mealAllowance"
                value={mealAllowance}
                onChange={(e) =>
                  handleChange(
                    "mealAllowance",
                    e.target.value ? parseFloat(e.target.value) : null
                  )
                }
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Night Differential */}
      <div className="space-y-2">
        <label
          htmlFor="compensation.nightDifferential"
          className="block text-sm font-medium text-text-primary"
        >
          Night Differential (%)
        </label>
        <div className="relative">
          <input
            type="number"
            id="compensation.nightDifferential"
            name="compensation.nightDifferential"
            value={nightDifferential}
            onChange={(e) =>
              handleChange(
                "nightDifferential",
                e.target.value ? parseFloat(e.target.value) : null
              )
            }
            min="0"
            max="100"
            step="0.01"
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 pr-8 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary">
            %
          </span>
        </div>
        <p className="flex items-center gap-2 text-xs text-text-secondary">
          <AlertCircle size={14} className="flex-shrink-0" />
          Per RA 11165, minimum night differential is 10% (₱
          {minimumNightDifferential.toLocaleString("en-PH", {
            maximumFractionDigits: 2,
          })})
        </p>
      </div>

      <input type="hidden" name="compensation.isExpanded" value="true" />
    </div>
  );
}
