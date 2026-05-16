"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import type { BenefitsPackageType } from "@/lib/schemas/offer-letter-ph";

interface BenefitsPackageSectionProps {
  initialValues: Partial<BenefitsPackageType>;
  onChange: (values: Partial<BenefitsPackageType>) => void;
  formRef?: React.RefObject<HTMLFormElement>;
}

export default function BenefitsPackageSection({
  initialValues,
  onChange,
  formRef,
}: BenefitsPackageSectionProps) {
  const handleChange = (field: keyof BenefitsPackageType, value: any) => {
    const updatedValues = {
      ...initialValues,
      [field]: value,
    };
    onChange(updatedValues);
  };

  const sssEnrolled = initialValues.sssEnrolled !== false;
  const philhealthEnrolled = initialValues.philhealthEnrolled !== false;
  const pagibigEnrolled = initialValues.pagibigEnrolled !== false;
  const serviceIncentiveLeave = initialValues.serviceIncentiveLeave || 5;
  const maternityPaternityLeave = initialValues.maternityPaternityLeave !== false;
  const hmoProvider = initialValues.hmoProvider || "";
  const lifeInsurance = initialValues.lifeInsurance === true;
  const vacationLeaveDays = initialValues.vacationLeaveDays || 0;
  const sickLeaveDays = initialValues.sickLeaveDays || 0;
  const otherPerks = initialValues.otherPerks || "";

  const renderMandatoryBenefit = (
    label: string,
    fieldName: keyof BenefitsPackageType,
    description: string
  ) => {
    return (
      <div className="flex items-start gap-3 rounded-md border border-green-500/20 bg-green-500/5 p-3">
        <CheckCircle2 size={18} className="flex-shrink-0 text-green-400 mt-1" />
        <div className="flex flex-1 gap-2">
          <input
            type="checkbox"
            id={`benefits.${fieldName}`}
            name={`benefitsPackage.${fieldName}`}
            checked={initialValues[fieldName] as boolean}
            onChange={(e) => handleChange(fieldName, e.target.checked)}
            className="cursor-pointer rounded border border-green-400 accent-green-500 mt-1"
          />
          <label
            htmlFor={`benefits.${fieldName}`}
            className="flex flex-1 flex-col gap-1 cursor-pointer"
          >
            <span className="font-medium text-text-primary">{label}</span>
            <span className="text-xs text-text-secondary">{description}</span>
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Mandatory Benefits */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">
          Mandatory Social Security Benefits (RA 7875, RA 11165)
        </p>

        {renderMandatoryBenefit(
          "SSS (Social Security System)",
          "sssEnrolled",
          "Mandatory employee-employer contribution for retirement and disability benefits."
        )}

        {renderMandatoryBenefit(
          "PhilHealth",
          "philhealthEnrolled",
          "Mandatory health insurance coverage for employee and dependents."
        )}

        {renderMandatoryBenefit(
          "Pag-IBIG (HDMF)",
          "pagibigEnrolled",
          "Home Development Mutual Fund - mandatory savings program for housing."
        )}

        {renderMandatoryBenefit(
          "Service Incentive Leave (SIL)",
          "maternityPaternityLeave",
          "Minimum 5 days per year. Maternity leave (60 days) and Paternity leave (7 days)."
        )}
      </div>

      {/* Leave Entitlements */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">
          Leave Entitlements
        </p>

        <div className="space-y-2">
          <label
            htmlFor="benefitsPackage.serviceIncentiveLeave"
            className="block text-sm font-medium text-text-primary"
          >
            Service Incentive Leave (Days/Year) <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            id="benefitsPackage.serviceIncentiveLeave"
            name="benefitsPackage.serviceIncentiveLeave"
            value={serviceIncentiveLeave}
            onChange={(e) =>
              handleChange("serviceIncentiveLeave", parseInt(e.target.value) || 5)
            }
            min="5"
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-text-secondary">
            Minimum 5 days per year (RA 7875)
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="benefitsPackage.vacationLeaveDays"
              className="block text-sm font-medium text-text-primary"
            >
              Vacation Leave (Days/Year)
            </label>
            <input
              type="number"
              id="benefitsPackage.vacationLeaveDays"
              name="benefitsPackage.vacationLeaveDays"
              value={vacationLeaveDays}
              onChange={(e) =>
                handleChange("vacationLeaveDays", parseInt(e.target.value) || 0)
              }
              min="0"
              className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="benefitsPackage.sickLeaveDays"
              className="block text-sm font-medium text-text-primary"
            >
              Sick Leave (Days/Year)
            </label>
            <input
              type="number"
              id="benefitsPackage.sickLeaveDays"
              name="benefitsPackage.sickLeaveDays"
              value={sickLeaveDays}
              onChange={(e) =>
                handleChange("sickLeaveDays", parseInt(e.target.value) || 0)
              }
              min="0"
              className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      {/* Company Benefits */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">
          Company Benefits (Optional)
        </p>

        <div className="space-y-2">
          <label
            htmlFor="benefitsPackage.hmoProvider"
            className="block text-sm font-medium text-text-primary"
          >
            HMO Provider
          </label>
          <input
            type="text"
            id="benefitsPackage.hmoProvider"
            name="benefitsPackage.hmoProvider"
            value={hmoProvider}
            onChange={(e) => handleChange("hmoProvider", e.target.value)}
            placeholder="e.g., Maxicare, Intellicare, Medicard"
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary placeholder-text-secondary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-start gap-3 rounded-md border border-[#333] bg-[#0f0f0f] p-3">
          <input
            type="checkbox"
            id="benefitsPackage.lifeInsurance"
            name="benefitsPackage.lifeInsurance"
            checked={lifeInsurance}
            onChange={(e) => handleChange("lifeInsurance", e.target.checked)}
            className="cursor-pointer rounded border border-[#555] accent-primary mt-1"
          />
          <label
            htmlFor="benefitsPackage.lifeInsurance"
            className="flex flex-1 flex-col gap-1 cursor-pointer"
          >
            <span className="font-medium text-text-primary">
              Group Life Insurance
            </span>
            <span className="text-xs text-text-secondary">
              Company-sponsored life insurance coverage
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="benefitsPackage.otherPerks"
            className="block text-sm font-medium text-text-primary"
          >
            Other Perks & Benefits
          </label>
          <textarea
            id="benefitsPackage.otherPerks"
            name="benefitsPackage.otherPerks"
            value={otherPerks}
            onChange={(e) => handleChange("otherPerks", e.target.value)}
            placeholder="e.g., Free WiFi, Gym membership, Training budget, Work-from-home setup allowance, Laptop provision, Health seminars..."
            rows={3}
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary placeholder-text-secondary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <input type="hidden" name="benefitsPackage.isExpanded" value="true" />
    </div>
  );
}
