"use client";

import React from "react";
import type { JobDetailsType } from "@/lib/schemas/offer-letter-ph";

interface JobDetailsSectionProps {
  initialValues: Partial<JobDetailsType>;
  onChange: (values: Partial<JobDetailsType>) => void;
  formRef?: React.RefObject<HTMLFormElement>;
}

export default function JobDetailsSection({
  initialValues,
  onChange,
  formRef,
}: JobDetailsSectionProps) {
  const handleChange = (field: keyof JobDetailsType, value: string) => {
    const updatedValues = {
      ...initialValues,
      [field]: value,
    };
    onChange(updatedValues);
  };

  const renderFormField = (
    label: string,
    name: keyof JobDetailsType,
    isTextarea: boolean = false,
    placeholder?: string,
    description?: string
  ) => {
    const value = initialValues[name] || "";

    return (
      <div key={name} className="space-y-2">
        <label
          htmlFor={`jobDetails.${name}`}
          className="block text-sm font-medium text-gray-900"
        >
          {label} <span className="text-red-600">*</span>
        </label>
        {isTextarea ? (
          <textarea
            id={`jobDetails.${name}`}
            name={`jobDetails.${name}`}
            value={value}
            onChange={(e) => handleChange(name, e.target.value)}
            placeholder={placeholder || label}
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        ) : (
          <input
            type="text"
            id={`jobDetails.${name}`}
            name={`jobDetails.${name}`}
            value={value}
            onChange={(e) => handleChange(name, e.target.value)}
            placeholder={placeholder || label}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        )}
        {description && (
          <p className="text-xs text-gray-500">{description}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {renderFormField(
          "Official Job Title",
          "officialTitle",
          false,
          "e.g., Senior Software Engineer"
        )}
        {renderFormField(
          "Department",
          "department",
          false,
          "e.g., Engineering"
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {renderFormField(
          "Supervisor Name",
          "supervisorName",
          false,
          "Full name of direct supervisor"
        )}
        {renderFormField(
          "Supervisor Title",
          "supervisorTitle",
          false,
          "e.g., Engineering Manager"
        )}
      </div>

      {renderFormField(
        "Job Responsibilities / Description",
        "jobResponsibilities",
        true,
        "Brief summary of key duties and responsibilities for this role...",
        "Minimum 10 characters. This will appear in the offer letter."
      )}

      {/* Hidden fields for form submission */}
      <input type="hidden" name="jobDetails.isExpanded" value="true" />
    </div>
  );
}
