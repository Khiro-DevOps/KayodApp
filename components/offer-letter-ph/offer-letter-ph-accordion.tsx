"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import JobDetailsSection from "./sections/job-details-section";
import EmploymentTermsSection from "./sections/employment-terms-section";
import CompensationSection from "./sections/compensation-section";
import BenefitsPackageSection from "./sections/benefits-package-section";
import ConditionsContingenciesSection from "./sections/conditions-contingencies-section";
import TerminationLanguageSection from "./sections/termination-language-section";
import AcceptanceSigningSection from "./sections/acceptance-signing-section";
import type {
  OfferLetterPhType,
  JobDetailsType,
  EmploymentTermsType,
  CompensationType,
  BenefitsPackageType,
  ConditionsContingenciesType,
  TerminationLanguageType,
  AcceptanceSigningType,
} from "@/lib/schemas/offer-letter-ph";

interface OfferLetterPhAccordionProps {
  initialValues?: Partial<OfferLetterPhType>;
  onValuesChange?: (values: Partial<OfferLetterPhType>) => void;
  formRef?: React.RefObject<HTMLFormElement>;
}

interface AccordionSection {
  id: string;
  title: string;
  isRequired: boolean;
  component: React.ComponentType<any>;
  badge: string;
}

const ACCORDION_SECTIONS: AccordionSection[] = [
  {
    id: "job-details",
    title: "Job Details",
    isRequired: true,
    component: JobDetailsSection,
    badge: "Required",
  },
  {
    id: "employment-terms",
    title: "Employment Terms (PH Compliance)",
    isRequired: true,
    component: EmploymentTermsSection,
    badge: "Required",
  },
  {
    id: "compensation",
    title: "Compensation (PHP)",
    isRequired: true,
    component: CompensationSection,
    badge: "Required",
  },
  {
    id: "benefits-package",
    title: "Benefits Package",
    isRequired: true,
    component: BenefitsPackageSection,
    badge: "Required",
  },
  {
    id: "conditions-contingencies",
    title: "Conditions & Contingencies",
    isRequired: false,
    component: ConditionsContingenciesSection,
    badge: "Optional",
  },
  {
    id: "termination-language",
    title: "Termination Language (Strict PH Law)",
    isRequired: true,
    component: TerminationLanguageSection,
    badge: "Required",
  },
  {
    id: "acceptance-signing",
    title: "Acceptance & Signing",
    isRequired: true,
    component: AcceptanceSigningSection,
    badge: "Required",
  },
];

export default function OfferLetterPhAccordion({
  initialValues = {},
  onValuesChange,
  formRef,
}: OfferLetterPhAccordionProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["job-details"])
  );
  const [values, setValues] = useState<Partial<OfferLetterPhType>>(initialValues);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const handleSectionChange = (
    sectionKey: keyof OfferLetterPhType,
    sectionValue: any
  ) => {
    const newValues = {
      ...values,
      [sectionKey]: sectionValue,
    };
    setValues(newValues);
    onValuesChange?.(newValues);
  };

  const getSectionValue = (sectionKey: keyof OfferLetterPhType): any => {
    return values[sectionKey] || {};
  };

  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="mb-6 space-y-1">
        <h2 className="text-lg font-semibold text-text-primary">
          Offer Letter Settings
        </h2>
        <p className="text-sm text-text-secondary">
          Configure all employment terms and conditions. Fields marked as
          <span className="ml-1 inline-block rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
            Required
          </span>
          must be completed.
        </p>
      </div>

      {/* Accordion Container */}
      <div className="space-y-2 rounded-lg border border-[#333] bg-[#1a1a1a] p-1">
        {ACCORDION_SECTIONS.map((section, index) => {
          const isExpanded = expandedSections.has(section.id);
          const SectionComponent = section.component;
          const sectionKey =
            section.id.replace(/-([a-z])/g, (g) =>
              g[1].toUpperCase()
            ) as keyof OfferLetterPhType;

          return (
            <div key={section.id} className="border-b border-[#333] last:border-b-0">
              {/* Section Header */}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#222]"
              >
                <div className="flex flex-1 items-center gap-3">
                  <ChevronDown
                    size={18}
                    className={`flex-shrink-0 text-text-secondary transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                  <div className="flex flex-col gap-1">
                    <h3 className="font-medium text-text-primary">
                      {section.title}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      section.isRequired
                        ? "bg-red-500/10 text-red-400"
                        : "bg-blue-500/10 text-blue-400"
                    }`}
                  >
                    {section.badge}
                  </span>
                </div>
              </button>

              {/* Section Content */}
              {isExpanded && (
                <div className="border-t border-[#333] bg-[#121212] px-4 py-4">
                  <SectionComponent
                    initialValues={getSectionValue(sectionKey)}
                    onChange={(value: any) =>
                      handleSectionChange(sectionKey, value)
                    }
                    formRef={formRef}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Info */}
      <div className="mt-6 rounded-lg border border-[#333] bg-[#0f0f0f] p-4">
        <p className="text-xs text-text-secondary">
          <strong>Note:</strong> All employment terms must comply with the
          Philippine Labor Code. This template includes validation for Art. 281
          (probation limits), P.D. 851 (13th month pay), and RA 11165 (night
          differential minimums).
        </p>
      </div>
    </div>
  );
}
