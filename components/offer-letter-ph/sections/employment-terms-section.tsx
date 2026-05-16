"use client";

import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import type { EmploymentTermsType } from "@/lib/schemas/offer-letter-ph";

interface EmploymentTermsSectionProps {
  initialValues: Partial<EmploymentTermsType>;
  onChange: (values: Partial<EmploymentTermsType>) => void;
  formRef?: React.RefObject<HTMLFormElement>;
}

export default function EmploymentTermsSection({
  initialValues,
  onChange,
  formRef,
}: EmploymentTermsSectionProps) {
  const [showProbationWarning, setShowProbationWarning] = useState(
    (initialValues.probationPeriod || 0) > 180
  );

  const handleChange = (field: keyof EmploymentTermsType, value: any) => {
    const updatedValues = {
      ...initialValues,
      [field]: value,
    };

    // Check probation warning
    if (field === "probationPeriod") {
      setShowProbationWarning(value > 180);
    }

    onChange(updatedValues);
  };

  const employmentStatusValue = initialValues.employmentStatus || "";
  const probationPeriodValue = initialValues.probationPeriod || 6;
  const startDateValue = initialValues.startDate || "";
  const workScheduleValue = initialValues.workSchedule || "";
  const workLocationValue = initialValues.workLocation || "";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Employment Status */}
        <div className="space-y-2">
          <label
            htmlFor="employmentTerms.employmentStatus"
            className="block text-sm font-medium text-gray-900"
          >
            Employment Status <span className="text-red-600">*</span>
          </label>
          <select
            id="employmentTerms.employmentStatus"
            name="employmentTerms.employmentStatus"
            value={employmentStatusValue}
            onChange={(e) => handleChange("employmentStatus", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Select Employment Status</option>
            <option value="regular">Regular</option>
            <option value="probationary">Probationary</option>
            <option value="project_based">Project-based</option>
            <option value="seasonal">Seasonal</option>
            <option value="casual">Casual</option>
          </select>
        </div>

        {/* Probation Period */}
        <div className="space-y-2">
          <label
            htmlFor="employmentTerms.probationPeriod"
            className="block text-sm font-medium text-gray-900"
          >
            Probation Period (Days) <span className="text-red-600">*</span>
          </label>
          <input
            type="number"
            id="employmentTerms.probationPeriod"
            name="employmentTerms.probationPeriod"
            value={probationPeriodValue}
            onChange={(e) =>
              handleChange("probationPeriod", parseInt(e.target.value) || 0)
            }
            min="0"
            max="180"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-gray-500">
            Default: 6 months (180 days)
          </p>
        </div>
      </div>

      {/* Probation Warning */}
      {showProbationWarning && (
        <div className="flex gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
          <AlertCircle size={18} className="flex-shrink-0 text-orange-600" />
          <div className="text-sm text-orange-700">
            <p className="font-medium">Art. 281 Compliance Warning</p>
            <p className="text-xs">
              Probation period exceeds 180 days. Per the Philippine Labor Code,
              probation should not exceed 6 months for rank-and-file employees.
              Consider adjusting.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Start Date */}
        <div className="space-y-2">
          <label
            htmlFor="employmentTerms.startDate"
            className="block text-sm font-medium text-gray-900"
          >
            Start Date <span className="text-red-600">*</span>
          </label>
          <input
            type="date"
            id="employmentTerms.startDate"
            name="employmentTerms.startDate"
            value={startDateValue}
            onChange={(e) => handleChange("startDate", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Work Location */}
        <div className="space-y-2">
          <label
            htmlFor="employmentTerms.workLocation"
            className="block text-sm font-medium text-gray-900"
          >
            Work Location <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="employmentTerms.workLocation"
            name="employmentTerms.workLocation"
            value={workLocationValue}
            onChange={(e) => handleChange("workLocation", e.target.value)}
            placeholder="e.g., BGC Taguig / Full Remote"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Work Schedule */}
      <div className="space-y-2">
        <label
          htmlFor="employmentTerms.workSchedule"
          className="block text-sm font-medium text-gray-900"
        >
          Work Schedule <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          id="employmentTerms.workSchedule"
          name="employmentTerms.workSchedule"
          value={workScheduleValue}
          onChange={(e) => handleChange("workSchedule", e.target.value)}
          placeholder="e.g., Mon-Fri, 8:00 AM - 5:00 PM"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <input type="hidden" name="employmentTerms.isExpanded" value="true" />
    </div>
  );
}
