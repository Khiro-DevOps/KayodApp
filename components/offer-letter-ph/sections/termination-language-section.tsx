"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import type { TerminationLanguageType } from "@/lib/schemas/offer-letter-ph";

interface TerminationLanguageSectionProps {
  initialValues: Partial<TerminationLanguageType>;
  onChange: (values: Partial<TerminationLanguageType>) => void;
  formRef?: React.RefObject<HTMLFormElement>;
}

const STANDARD_LANGUAGE = `Termination of employment shall be in accordance with the provisions of the Philippine Labor Code of the Philippines, as amended, and the implementing rules and regulations thereof. Employment may be terminated only for just cause as defined under Article 282 of the Labor Code (willful disobedience, gross and habitual neglect of duties, fraud or willful breach of trust, commission of a crime, habitual drunkenness or drug addiction, or analogous causes), or authorized cause as defined under Article 283 of the Labor Code (installation of labor-saving devices, redundancy, retrenchment, or cessation of business operations), subject to the requirements of due process and notice as provided by law. Any termination without legal cause shall be considered illegal and the employee shall be entitled to full backwages and separation pay as mandated by the Labor Code.`;

export default function TerminationLanguageSection({
  initialValues,
  onChange,
  formRef,
}: TerminationLanguageSectionProps) {
  const handleChange = (
    field: keyof TerminationLanguageType,
    value: any
  ) => {
    const updatedValues = {
      ...initialValues,
      [field]: value,
    };
    onChange(updatedValues);
  };

  const useStandardLaborCode = initialValues.useStandardLaborCode !== false;
  const customTerminationClause = initialValues.customTerminationClause || "";

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
        <AlertCircle size={18} className="flex-shrink-0 text-blue-400 mt-0.5" />
        <p className="text-sm text-blue-300">
          <strong>Compliance Note:</strong> All termination clauses must comply
          with the Philippine Labor Code. "At-Will" employment is not recognized
          under PH law. Termination is only valid for just cause (Art. 282) or
          authorized cause (Art. 283).
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-[#333] bg-[#0f0f0f] p-3">
        <input
          type="radio"
          id="useStandardLanguage"
          name="terminationLanguage.useStandardLaborCode"
          value="true"
          checked={useStandardLaborCode}
          onChange={() => handleChange("useStandardLaborCode", true)}
          className="cursor-pointer mt-1"
        />
        <label htmlFor="useStandardLanguage" className="flex-1 cursor-pointer">
          <p className="font-medium text-text-primary">
            Use Standard Philippine Labor Code Language
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Recommended: Ensures compliance with PH Labor Law and includes all
            mandatory protections
          </p>
        </label>
      </div>

      {useStandardLaborCode && (
        <div className="rounded-md border border-green-500/20 bg-green-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-green-400">PREVIEW</p>
          <p className="text-sm text-text-primary leading-relaxed">
            {STANDARD_LANGUAGE}
          </p>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-md border border-[#333] bg-[#0f0f0f] p-3">
        <input
          type="radio"
          id="useCustomLanguage"
          name="terminationLanguage.useStandardLaborCode"
          value="false"
          checked={!useStandardLaborCode}
          onChange={() => handleChange("useStandardLaborCode", false)}
          className="cursor-pointer mt-1"
        />
        <label htmlFor="useCustomLanguage" className="flex-1 cursor-pointer">
          <p className="font-medium text-text-primary">
            Use Custom Termination Clause
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Only if you have legal counsel review the custom clause for PH Law
            compliance
          </p>
        </label>
      </div>

      {!useStandardLaborCode && (
        <div className="space-y-2">
          <label
            htmlFor="customTerminationClause"
            className="block text-sm font-medium text-text-primary"
          >
            Custom Termination Clause <span className="text-red-400">*</span>
          </label>
          <textarea
            id="customTerminationClause"
            name="terminationLanguage.customTerminationClause"
            value={customTerminationClause}
            onChange={(e) =>
              handleChange("customTerminationClause", e.target.value)
            }
            placeholder="Enter your custom termination clause here. Ensure it complies with Philippine Labor Code Articles 282 (just cause) and 283 (authorized cause)."
            rows={6}
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary placeholder-text-secondary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-orange-400">
            ⚠️ Warning: Ensure your custom clause does not violate the
            Philippine Labor Code. We recommend having legal counsel review
            this.
          </p>
        </div>
      )}

      {/* Hidden field to capture standard language when radio is selected */}
      {useStandardLaborCode && (
        <input
          type="hidden"
          name="terminationLanguage.standardLanguagePreview"
          value={STANDARD_LANGUAGE}
        />
      )}

      <input type="hidden" name="terminationLanguage.isExpanded" value="true" />
    </div>
  );
}
