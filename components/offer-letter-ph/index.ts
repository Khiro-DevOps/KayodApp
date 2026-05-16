/**
 * Main export file for Philippine-Compliant Offer Letter Module
 * 
 * Usage:
 * import {
 *   OfferLetterPhAccordion,
 *   useOfferLetterPh,
 *   validateOfferLetterPhFormData
 * } from "@/components/offer-letter-ph";
 */

// ============================================================
// COMPONENT EXPORTS
// ============================================================
export { default as OfferLetterPhAccordion } from "./offer-letter-ph-accordion";

// Section components (for advanced usage)
export { default as JobDetailsSection } from "./sections/job-details-section";
export { default as EmploymentTermsSection } from "./sections/employment-terms-section";
export { default as CompensationSection } from "./sections/compensation-section";
export { default as BenefitsPackageSection } from "./sections/benefits-package-section";
export { default as ConditionsContingenciesSection } from "./sections/conditions-contingencies-section";
export { default as TerminationLanguageSection } from "./sections/termination-language-section";
export { default as AcceptanceSigningSection } from "./sections/acceptance-signing-section";

// ============================================================
// TYPE EXPORTS
// ============================================================
export type {
  OfferLetterPhType,
  JobDetailsType,
  EmploymentTermsType,
  CompensationType,
  BenefitsPackageType,
  ConditionsContingenciesType,
  TerminationLanguageType,
  AcceptanceSigningType,
  OfferLetterPhFormDataType,
} from "@/lib/schemas/offer-letter-ph";

// ============================================================
// SCHEMA EXPORTS
// ============================================================
export {
  OfferLetterPhSchema,
  JobDetailsSchema,
  EmploymentTermsSchema,
  CompensationSchema,
  BenefitsPackageSchema,
  ConditionsContingenciesSchema,
  TerminationLanguageSchema,
  AcceptanceSigningSchema,
  OfferLetterPhFormDataSchema,
} from "@/lib/schemas/offer-letter-ph";

// ============================================================
// UTILITY EXPORTS
// ============================================================
export {
  flattenOfferLetterPhToFormData,
  validateOfferLetterPhFormData,
  createOfferLetterSummary,
  formatOfferLetterPhForDocuSeal,
  mapOfferLetterPhToJobPosting,
} from "@/lib/offer-letter-ph-utils";
