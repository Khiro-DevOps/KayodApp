"use client";

import React from "react";
import type { AcceptanceSigningType } from "@/lib/schemas/offer-letter-ph";

interface AcceptanceSigningSectionProps {
  initialValues: Partial<AcceptanceSigningType>;
  onChange: (values: Partial<AcceptanceSigningType>) => void;
  formRef?: React.RefObject<HTMLFormElement>;
}

export default function AcceptanceSigningSection({
  initialValues,
  onChange,
  formRef,
}: AcceptanceSigningSectionProps) {
  const handleChange = (field: keyof AcceptanceSigningType, value: any) => {
    const updatedValues = {
      ...initialValues,
      [field]: value,
    };
    onChange(updatedValues);
  };

  const acceptanceDeadlineDays = initialValues.acceptanceDeadlineDays || 14;
  const hrSignatoryName = initialValues.hrSignatoryName || "";
  const hrSignatoryTitle = initialValues.hrSignatoryTitle || "";
  const requireHrCountersignature =
    initialValues.requireHrCountersignature === true;
  const introParagraph = initialValues.introParagraph ||
    `Dear [Candidate Name],\n\nWe are pleased to extend this formal offer of employment to you for the position of [Position Title] at [Company Name]. After careful consideration of your qualifications and interview performance, we believe you will be a valuable addition to our team.`;
  const closingParagraph = initialValues.closingParagraph ||
    `We look forward to welcoming you to the [Company Name] team. Please sign and return this letter by the deadline indicated above to confirm your acceptance. Should you have any questions, please do not hesitate to contact us.\n\nBest regards,\n[HR Signatory Name]\n[HR Signatory Title]\n[Company Name]`;

  return (
    <div className="space-y-4">
      {/* Acceptance Details */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="acceptanceSigning.acceptanceDeadlineDays"
            className="block text-sm font-medium text-text-primary"
          >
            Acceptance Deadline (Days) <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            id="acceptanceSigning.acceptanceDeadlineDays"
            name="acceptanceSigning.acceptanceDeadlineDays"
            value={acceptanceDeadlineDays}
            onChange={(e) =>
              handleChange("acceptanceDeadlineDays", parseInt(e.target.value))
            }
            min="1"
            max="90"
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-text-secondary">
            Number of days from offer issuance (recommended: 7-30 days)
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="acceptanceSigning.hrSignatoryTitle"
            className="block text-sm font-medium text-text-primary"
          >
            HR Signatory Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            id="acceptanceSigning.hrSignatoryTitle"
            name="acceptanceSigning.hrSignatoryTitle"
            value={hrSignatoryTitle}
            onChange={(e) => handleChange("hrSignatoryTitle", e.target.value)}
            placeholder="e.g., HR Manager, HR Director"
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary placeholder-text-secondary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* HR Signatory Name */}
      <div className="space-y-2">
        <label
          htmlFor="acceptanceSigning.hrSignatoryName"
          className="block text-sm font-medium text-text-primary"
        >
          HR Signatory Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          id="acceptanceSigning.hrSignatoryName"
          name="acceptanceSigning.hrSignatoryName"
          value={hrSignatoryName}
          onChange={(e) => handleChange("hrSignatoryName", e.target.value)}
          placeholder="Full name of HR representative"
          className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary placeholder-text-secondary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Countersignature */}
      <div className="flex items-start gap-3 rounded-md border border-[#333] bg-[#0f0f0f] p-3">
        <input
          type="checkbox"
          id="acceptanceSigning.requireHrCountersignature"
          name="acceptanceSigning.requireHrCountersignature"
          checked={requireHrCountersignature}
          onChange={(e) =>
            handleChange("requireHrCountersignature", e.target.checked)
          }
          className="cursor-pointer rounded border border-[#555] accent-primary mt-1"
        />
        <label
          htmlFor="acceptanceSigning.requireHrCountersignature"
          className="flex flex-1 flex-col gap-1 cursor-pointer"
        >
          <span className="font-medium text-text-primary">
            Require HR Director/CEO Countersignature
          </span>
          <span className="text-xs text-text-secondary">
            Offer letter will require approval from a higher authority
          </span>
        </label>
      </div>

      {/* Letter Paragraphs */}
      <div className="space-y-4 border-t border-[#333] pt-4">
        <p className="text-sm font-semibold text-text-primary">
          Offer Letter Paragraphs
        </p>

        <div className="space-y-2">
          <label
            htmlFor="acceptanceSigning.introParagraph"
            className="block text-sm font-medium text-text-primary"
          >
            Introduction Paragraph <span className="text-red-400">*</span>
          </label>
          <textarea
            id="acceptanceSigning.introParagraph"
            name="acceptanceSigning.introParagraph"
            value={introParagraph}
            onChange={(e) => handleChange("introParagraph", e.target.value)}
            rows={5}
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 font-mono"
          />
          <p className="text-xs text-text-secondary">
            You can use [Candidate Name] and [Company Name] as placeholders
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="acceptanceSigning.closingParagraph"
            className="block text-sm font-medium text-text-primary"
          >
            Closing Paragraph <span className="text-red-400">*</span>
          </label>
          <textarea
            id="acceptanceSigning.closingParagraph"
            name="acceptanceSigning.closingParagraph"
            value={closingParagraph}
            onChange={(e) => handleChange("closingParagraph", e.target.value)}
            rows={5}
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 font-mono"
          />
          <p className="text-xs text-text-secondary">
            You can use [HR Signatory Name], [HR Signatory Title], and
            [Company Name] as placeholders
          </p>
        </div>
      </div>

      <input type="hidden" name="acceptanceSigning.isExpanded" value="true" />
    </div>
  );
}
