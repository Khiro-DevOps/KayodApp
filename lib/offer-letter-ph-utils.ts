/**
 * Utility functions for Philippine-compliant offer letter form handling
 */

import type { OfferLetterPhType, OfferLetterPhFormDataType } from "@/lib/schemas/offer-letter-ph";
import {
  OfferLetterPhSchema,
  OfferLetterPhFormDataSchema,
} from "@/lib/schemas/offer-letter-ph";
import { z } from "zod";

/**
 * Convert OfferLetterPh form data to nested structure
 * Useful for API submissions
 */
export function flattenOfferLetterPhToFormData(
  data: Partial<OfferLetterPhType>
): Record<string, any> {
  const formData: Record<string, any> = {};

  // Flatten nested sections
  if (data.jobDetails) {
    Object.entries(data.jobDetails).forEach(([key, value]) => {
      formData[`jobDetails.${key}`] = value;
    });
  }

  if (data.employmentTerms) {
    Object.entries(data.employmentTerms).forEach(([key, value]) => {
      formData[`employmentTerms.${key}`] = value;
    });
  }

  if (data.compensation) {
    Object.entries(data.compensation).forEach(([key, value]) => {
      formData[`compensation.${key}`] = value;
    });
  }

  if (data.benefitsPackage) {
    Object.entries(data.benefitsPackage).forEach(([key, value]) => {
      formData[`benefitsPackage.${key}`] = value;
    });
  }

  if (data.conditionsContingencies) {
    Object.entries(data.conditionsContingencies).forEach(([key, value]) => {
      formData[`conditionsContingencies.${key}`] = value;
    });
  }

  if (data.terminationLanguage) {
    Object.entries(data.terminationLanguage).forEach(([key, value]) => {
      formData[`terminationLanguage.${key}`] = value;
    });
  }

  if (data.acceptanceSigning) {
    Object.entries(data.acceptanceSigning).forEach(([key, value]) => {
      formData[`acceptanceSigning.${key}`] = value;
    });
  }

  return formData;
}

/**
 * Validate offer letter form data using Zod
 */
export function validateOfferLetterPhFormData(
  formData: Record<string, any>
): {
  success: boolean;
  data?: Partial<OfferLetterPhType>;
  errors?: Record<string, string>;
} {
  try {
    // Transform FormData-like object into typed structure
    const parsedData = OfferLetterPhFormDataSchema.safeParse(formData);

    if (!parsedData.success) {
      const errors: Record<string, string> = {};
      parsedData.error.errors.forEach((error) => {
        const path = error.path.join(".");
        errors[path] = error.message;
      });
      return { success: false, errors };
    }

    return { success: true, data: parsedData.data as any };
  } catch (error) {
    return {
      success: false,
      errors: {
        general: error instanceof Error ? error.message : "Validation failed",
      },
    };
  }
}

/**
 * Create condensed offer letter summary for preview/confirmation
 */
export function createOfferLetterSummary(
  data: Partial<OfferLetterPhType>
): Record<string, any> {
  return {
    position: {
      title: data.jobDetails?.officialTitle,
      department: data.jobDetails?.department,
      supervisor: data.jobDetails?.supervisorName,
    },
    employment: {
      status: data.employmentTerms?.employmentStatus,
      probation: data.employmentTerms?.probationPeriod,
      startDate: data.employmentTerms?.startDate,
      workLocation: data.employmentTerms?.workLocation,
    },
    compensation: {
      baseSalary: data.compensation?.monthlyBasicSalary,
      payFrequency: data.compensation?.payFrequency,
      thirteenthMonth: data.compensation?.mandatory13thMonth,
      allowances: {
        transport: data.compensation?.transportAllowance,
        meal: data.compensation?.mealAllowance,
      },
    },
    benefits: {
      mandatory: {
        sss: data.benefitsPackage?.sssEnrolled,
        philhealth: data.benefitsPackage?.philhealthEnrolled,
        pagibig: data.benefitsPackage?.pagibigEnrolled,
      },
      optional: {
        hmo: data.benefitsPackage?.hmoProvider,
        lifeInsurance: data.benefitsPackage?.lifeInsurance,
      },
    },
    contingencies: {
      nbiClearance: data.conditionsContingencies?.nbiClearance,
      policeClearance: data.conditionsContingencies?.policeClearance,
      preEmploymentMedical: data.conditionsContingencies?.preEmploymentMedical,
      drugTest: data.conditionsContingencies?.drugTest,
    },
  };
}

/**
 * Format offer letter as DocuSeal template payload
 * Integrates with the existing DocuSeal integration
 */
export function formatOfferLetterPhForDocuSeal(
  data: Partial<OfferLetterPhType>
): Record<string, any> {
  const compensation = data.compensation || {};
  const employmentTerms = data.employmentTerms || {};
  const acceptanceSigning = data.acceptanceSigning || {};
  const terminationLanguage = data.terminationLanguage || {};
  const benefits = data.benefitsPackage || {};

  return {
    // Basic job info
    jobTitle: data.jobDetails?.officialTitle,
    department: data.jobDetails?.department,
    jobDescription: data.jobDetails?.jobResponsibilities,

    // Employment terms
    employmentStatus: employmentTerms.employmentStatus,
    probationPeriod: employmentTerms.probationPeriod,
    startDate: employmentTerms.startDate,
    workSchedule: employmentTerms.workSchedule,
    workLocation: employmentTerms.workLocation,

    // Compensation (PHP)
    currency: "PHP",
    baseSalary: compensation.monthlyBasicSalary,
    payFrequency: compensation.payFrequency,
    thirteenthMonthPay: compensation.mandatory13thMonth,
    performanceBonus: compensation.performanceBonus,
    signingBonus: compensation.signingBonus,
    commissionStructure: compensation.commissionStructure,
    transportAllowance: compensation.transportAllowance,
    mealAllowance: compensation.mealAllowance,
    nightDifferential: compensation.nightDifferential,

    // Benefits
    sssMandatory: benefits.sssEnrolled,
    philhealthMandatory: benefits.philhealthEnrolled,
    pagibigMandatory: benefits.pagibigEnrolled,
    serviceIncentiveLeave: benefits.serviceIncentiveLeave,
    hmoProvider: benefits.hmoProvider,
    lifeInsurance: benefits.lifeInsurance,
    vacationLeaveDays: benefits.vacationLeaveDays,
    sickLeaveDays: benefits.sickLeaveDays,
    otherPerks: benefits.otherPerks,

    // Conditions
    conditions: {
      nbiClearance: data.conditionsContingencies?.nbiClearance,
      policeClearance: data.conditionsContingencies?.policeClearance,
      preEmploymentMedical: data.conditionsContingencies?.preEmploymentMedical,
      drugTest: data.conditionsContingencies?.drugTest,
      torDiplomaVerification: data.conditionsContingencies?.torDiplomaVerification,
      ndaRequired: data.conditionsContingencies?.ndaRequired,
      nonCompeteRequired: data.conditionsContingencies?.nonCompeteRequired,
      additionalConditions: data.conditionsContingencies?.additionalConditions,
    },

    // Termination
    terminationLanguage: terminationLanguage.useStandardLaborCode
      ? terminationLanguage.standardLanguagePreview
      : terminationLanguage.customTerminationClause,

    // Acceptance
    acceptanceDeadlineDays: acceptanceSigning.acceptanceDeadlineDays,
    hrSignatoryName: acceptanceSigning.hrSignatoryName,
    hrSignatoryTitle: acceptanceSigning.hrSignatoryTitle,
    requireHrCountersignature: acceptanceSigning.requireHrCountersignature,
    introParagraph: acceptanceSigning.introParagraph,
    closingParagraph: acceptanceSigning.closingParagraph,

    // Metadata
    type: "philippine_compliant_offer_letter",
    version: "1.0",
    complianceNotes: [
      "Art. 281: Probation period capped at 180 days",
      "P.D. 851: 13th month pay is mandatory",
      "RA 7875: SSS, PhilHealth, Pag-IBIG are mandatory",
      "RA 11165: Night differential minimum 10%",
      "PH Labor Code: Termination only for just or authorized cause",
    ],
  };
}

/**
 * Map offer letter fields to job_postings table columns
 * For database storage
 */
export function mapOfferLetterPhToJobPosting(
  data: Partial<OfferLetterPhType>
): Record<string, any> {
  const compensation = data.compensation || {};

  return {
    // Basic employment info
    title: data.jobDetails?.officialTitle,
    description: data.jobDetails?.jobResponsibilities,
    location: data.employmentTerms?.workLocation,

    // Salary info
    salary_min: compensation.monthlyBasicSalary,
    salary_max: compensation.monthlyBasicSalary,
    currency: "PHP",

    // Employment type mapping
    employment_type: data.employmentTerms?.employmentStatus === "regular" ? "full-time" : "contract",

    // Store full settings as JSONB
    offer_letter_settings: formatOfferLetterPhForDocuSeal(data),
  };
}
