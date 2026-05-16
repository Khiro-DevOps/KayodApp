"use client";

import React from "react";
import type { ConditionsContingenciesType } from "@/lib/schemas/offer-letter-ph";

interface ConditionsContingenciesSectionProps {
  initialValues: Partial<ConditionsContingenciesType>;
  onChange: (values: Partial<ConditionsContingenciesType>) => void;
  formRef?: React.RefObject<HTMLFormElement>;
}

export default function ConditionsContingenciesSection({
  initialValues,
  onChange,
  formRef,
}: ConditionsContingenciesSectionProps) {
  const handleChange = (field: keyof ConditionsContingenciesType, value: any) => {
    const updatedValues = {
      ...initialValues,
      [field]: value,
    };
    onChange(updatedValues);
  };

  const nbiClearance = initialValues.nbiClearance === true;
  const policeClearance = initialValues.policeClearance === true;
  const preEmploymentMedical = initialValues.preEmploymentMedical !== false;
  const drugTest = initialValues.drugTest !== false;
  const torDiplomaVerification = initialValues.torDiplomaVerification !== false;
  const ndaRequired = initialValues.ndaRequired === true;
  const nonCompeteRequired = initialValues.nonCompeteRequired === true;
  const additionalConditions = initialValues.additionalConditions || "";

  const renderCheckboxCondition = (
    label: string,
    fieldName: keyof ConditionsContingenciesType,
    description: string
  ) => {
    return (
      <div className="flex items-start gap-3 rounded-md border border-[#333] bg-[#0f0f0f] p-3">
        <input
          type="checkbox"
          id={`conditions.${fieldName}`}
          name={`conditionsContingencies.${fieldName}`}
          checked={initialValues[fieldName] as boolean}
          onChange={(e) => handleChange(fieldName, e.target.checked)}
          className="cursor-pointer rounded border border-[#555] accent-primary mt-1"
        />
        <label
          htmlFor={`conditions.${fieldName}`}
          className="flex flex-1 flex-col gap-1 cursor-pointer"
        >
          <span className="font-medium text-text-primary">{label}</span>
          <span className="text-xs text-text-secondary">{description}</span>
        </label>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Select the pre-employment conditions and contingencies that are required
        for this position.
      </p>

      {/* Background Verification */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">
          Background Verification
        </p>
        {renderCheckboxCondition(
          "NBI Clearance",
          "nbiClearance",
          "National Bureau of Investigation clearance certificate required"
        )}
        {renderCheckboxCondition(
          "Police Clearance",
          "policeClearance",
          "Police clearance certificate from local precinct"
        )}
      </div>

      {/* Medical & Compliance */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">
          Medical & Compliance
        </p>
        {renderCheckboxCondition(
          "Pre-employment Medical Exam",
          "preEmploymentMedical",
          "Mandatory medical examination (common for most positions)"
        )}
        {renderCheckboxCondition(
          "Drug Test (DOLE-compliant)",
          "drugTest",
          "Drug screening test per DOLE guidelines"
        )}
      </div>

      {/* Educational Verification */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">
          Educational Verification
        </p>
        {renderCheckboxCondition(
          "TOR/Diploma Verification",
          "torDiplomaVerification",
          "Transcript of Records and diploma authentication"
        )}
      </div>

      {/* Legal Agreements */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">
          Legal Agreements
        </p>
        {renderCheckboxCondition(
          "NDA (Non-Disclosure Agreement)",
          "ndaRequired",
          "Employee must sign NDA to protect company confidential information"
        )}
        {renderCheckboxCondition(
          "Non-compete Clause",
          "nonCompeteRequired",
          "Employee agrees not to work for direct competitors during employment and specified period after"
        )}
      </div>

      {/* Additional Conditions */}
      <div className="space-y-2">
        <label
          htmlFor="conditionsContingencies.additionalConditions"
          className="block text-sm font-medium text-text-primary"
        >
          Additional Conditions or Contingencies
        </label>
        <textarea
          id="conditionsContingencies.additionalConditions"
          name="conditionsContingencies.additionalConditions"
          value={additionalConditions}
          onChange={(e) => handleChange("additionalConditions", e.target.value)}
          placeholder="Any other pre-employment requirements or conditions..."
          rows={4}
          className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary placeholder-text-secondary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <input type="hidden" name="conditionsContingencies.isExpanded" value="true" />
    </div>
  );
}
