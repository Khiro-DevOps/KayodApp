import { z } from "zod";

/**
 * Philippine-Compliant Offer Letter Schema
 * Enforces Philippine Labor Code constraints:
 * - Art. 281: Probation max 6 months (180 days)
 * - P.D. 851: Mandatory 13th month pay
 * - RA 7875: SSS, PhilHealth, Pag-IBIG mandatory
 * - RA 11165: Night differential minimum 10%
 */

const BASE_SECTION_SCHEMA = {
  isExpanded: z.boolean().default(false).optional(),
};

// ============================================================
// SECTION 1: JOB DETAILS
// ============================================================
export const JobDetailsSchema = z.object({
  officialTitle: z
    .string()
    .min(1, "Official job title is required")
    .max(255, "Title must be 255 characters or less"),
  department: z
    .string()
    .min(1, "Department is required")
    .max(100, "Department must be 100 characters or less"),
  supervisorName: z
    .string()
    .min(1, "Supervisor name is required")
    .max(100, "Supervisor name must be 100 characters or less"),
  supervisorTitle: z
    .string()
    .min(1, "Supervisor title is required")
    .max(100, "Supervisor title must be 100 characters or less"),
  jobResponsibilities: z
    .string()
    .min(10, "Job responsibilities must be at least 10 characters")
    .max(2000, "Job responsibilities must not exceed 2000 characters"),
  ...BASE_SECTION_SCHEMA,
});

export type JobDetailsType = z.infer<typeof JobDetailsSchema>;

// ============================================================
// SECTION 2: EMPLOYMENT TERMS (PH Compliance)
// ============================================================
export const EmploymentTermsSchema = z.object({
  employmentStatus: z.enum(["regular", "probationary", "project_based", "seasonal", "casual"], {
    errorMap: () => ({ message: "Select a valid employment status" }),
  }),
  probationPeriod: z
    .number()
    .int("Probation period must be a whole number")
    .min(0, "Probation period cannot be negative")
    .max(180, "Per Art. 281 of Philippine Labor Code, probation cannot exceed 180 days (6 months)")
    .default(6)
    .optional(),
  startDate: z
    .string()
    .refine((date) => {
      const d = new Date(date);
      return d instanceof Date && !isNaN(d.getTime());
    }, "Start date must be a valid date")
    .refine((date) => {
      const d = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d >= today;
    }, "Start date must be today or later"),
  workSchedule: z
    .string()
    .min(1, "Work schedule is required")
    .max(200, "Work schedule must be 200 characters or less")
    .describe("e.g., Mon-Fri, 8:00 AM - 5:00 PM; Shift schedule; etc."),
  workLocation: z
    .string()
    .min(1, "Work location is required")
    .max(200, "Work location must be 200 characters or less"),
  probationaryWarning: z
    .boolean()
    .default(false)
    .optional()
    .describe("Internal flag for probation > 180 days warning"),
  ...BASE_SECTION_SCHEMA,
});

export type EmploymentTermsType = z.infer<typeof EmploymentTermsSchema>;

// ============================================================
// SECTION 3: COMPENSATION (PHP Currency)
// ============================================================
export const CompensationSchema = z.object({
  monthlyBasicSalary: z
    .number()
    .positive("Monthly basic salary must be greater than 0")
    .finite("Monthly basic salary must be a valid number")
    .describe("In Philippine Peso (PHP)"),
  payFrequency: z.enum(["monthly", "semi_monthly", "weekly"], {
    errorMap: () => ({ message: "Select a valid pay frequency" }),
  }),
  mandatory13thMonth: z
    .boolean()
    .default(true)
    .describe("Required by P.D. 851 - Thirteenth Month Pay"),
  performanceBonus: z
    .number()
    .nonnegative("Performance bonus cannot be negative")
    .optional()
    .nullable(),
  signingBonus: z
    .number()
    .nonnegative("Signing bonus cannot be negative")
    .optional()
    .nullable(),
  commissionStructure: z
    .string()
    .max(500, "Commission structure must be 500 characters or less")
    .optional()
    .nullable()
    .describe("e.g., 5% of sales; tiered commission; etc."),
  transportAllowance: z
    .number()
    .nonnegative("Transport allowance cannot be negative")
    .optional()
    .nullable()
    .describe("Monthly transport allowance in PHP"),
  internetAllowance: z
    .number()
    .nonnegative("Internet allowance cannot be negative")
    .optional()
    .nullable()
    .describe("Monthly internet allowance in PHP for remote or hybrid work"),
  mealAllowance: z
    .number()
    .nonnegative("Meal allowance cannot be negative")
    .optional()
    .nullable()
    .describe("Daily meal allowance in PHP"),
  nightDifferential: z
    .number()
    .min(10, "Per RA 11165, night differential must be at least 10% of base salary")
    .max(100, "Night differential cannot exceed 100%")
    .optional()
    .nullable()
    .describe("Percentage (%) - minimum 10% per RA 11165"),
  ...BASE_SECTION_SCHEMA,
});

export type CompensationType = z.infer<typeof CompensationSchema>;

// ============================================================
// SECTION 4: BENEFITS PACKAGE
// ============================================================
export const BenefitsPackageSchema = z.object({
  // Mandatory benefits (per RA 7875, R.A. 11165, P.D. 851)
  sssEnrolled: z
    .boolean()
    .default(true)
    .describe("Social Security System (SSS) - Mandatory"),
  philhealthEnrolled: z
    .boolean()
    .default(true)
    .describe("PhilHealth - Mandatory"),
  pagibigEnrolled: z
    .boolean()
    .default(true)
    .describe("Pag-IBIG (HDMF) - Mandatory"),
  serviceIncentiveLeave: z
    .number()
    .min(5, "Service Incentive Leave minimum is 5 days per year")
    .default(5)
    .describe("Minimum 5 days per year (RA 7875)"),
  maternityPaternityLeave: z
    .boolean()
    .default(true)
    .describe("Maternity/Paternity Leave - Mandatory"),

  // Company benefits
  hmoProvider: z
    .string()
    .max(100, "HMO provider must be 100 characters or less")
    .optional()
    .nullable()
    .describe("e.g., Maxicare, Intellicare, Medicard, etc."),
  lifeInsurance: z
    .boolean()
    .default(false)
    .describe("Group life insurance coverage"),
  vacationLeaveDays: z
    .number()
    .nonnegative("Vacation leave days cannot be negative")
    .default(0)
    .describe("Annual vacation leave days"),
  sickLeaveDays: z
    .number()
    .nonnegative("Sick leave days cannot be negative")
    .default(0)
    .describe("Annual sick leave days"),
  otherPerks: z
    .string()
    .max(1000, "Other perks must be 1000 characters or less")
    .optional()
    .nullable()
    .describe("e.g., free WiFi, gym membership, training budget, work-from-home setup allowance, etc."),
  ...BASE_SECTION_SCHEMA,
});

export type BenefitsPackageType = z.infer<typeof BenefitsPackageSchema>;

// ============================================================
// SECTION 5: CONDITIONS & CONTINGENCIES
// ============================================================
export const ConditionsContingenciesSchema = z.object({
  nbiClearance: z.boolean().default(false).describe("NBI Clearance required"),
  policeClearance: z.boolean().default(false).describe("Police Clearance required"),
  preEmploymentMedical: z.boolean().default(true).describe("Pre-employment Medical Exam required"),
  drugTest: z.boolean().default(true).describe("Drug Test (DOLE-compliant) required"),
  torDiplomaVerification: z.boolean().default(true).describe("TOR/Diploma Verification required"),
  ndaRequired: z.boolean().default(false).describe("NDA (Non-Disclosure Agreement) required"),
  nonCompeteRequired: z.boolean().default(false).describe("Non-compete Clause required"),
  additionalConditions: z
    .string()
    .max(1000, "Additional conditions must be 1000 characters or less")
    .optional()
    .nullable()
    .describe("Any other conditions or contingencies"),
  ...BASE_SECTION_SCHEMA,
});

export type ConditionsContingenciesType = z.infer<
  typeof ConditionsContingenciesSchema
>;

// ============================================================
// SECTION 6: TERMINATION LANGUAGE (Strict PH Law)
// ============================================================
export const TerminationLanguageSchema = z.object({
  useStandardLaborCode: z
    .boolean()
    .default(true)
    .describe("Use standard Philippine Labor Code language vs custom clause"),
  customTerminationClause: z
    .string()
    .max(2000, "Termination clause must be 2000 characters or less")
    .optional()
    .nullable()
    .describe(
      "Custom termination clause (only used if useStandardLaborCode is false). Must not contradict Labor Code."
    ),
  standardLanguagePreview: z
    .string()
    .default(
      `Termination of employment shall be in accordance with the provisions of the Philippine Labor Code of the Philippines, as amended, and the implementing rules and regulations thereof. Employment may be terminated only for just cause as defined under Article 282 of the Labor Code, or authorized cause as defined under Article 283 of the Labor Code, subject to the requirements of due process. Any unauthorized termination shall be considered illegal and the employee shall be entitled to separation pay and other benefits as mandated by law.`
    )
    .optional(),
  ...BASE_SECTION_SCHEMA,
});

export type TerminationLanguageType = z.infer<typeof TerminationLanguageSchema>;

// ============================================================
// SECTION 7: ACCEPTANCE & SIGNING
// ============================================================
export const AcceptanceSigningSchema = z.object({
  acceptanceDeadlineDays: z
    .number()
    .int("Acceptance deadline must be a whole number")
    .positive("Acceptance deadline must be greater than 0")
    .max(90, "Acceptance deadline should not exceed 90 days")
    .describe("Number of days from offer issuance for candidate to accept"),
  hrSignatoryName: z
    .string()
    .min(1, "HR signatory name is required")
    .max(100, "HR signatory name must be 100 characters or less")
    .describe("Full name of HR representative who will sign"),
  hrSignatoryTitle: z
    .string()
    .min(1, "HR signatory title is required")
    .max(100, "HR signatory title must be 100 characters or less")
    .describe("e.g., HR Manager, HR Director, Head of People Operations"),
  requireHrCountersignature: z
    .boolean()
    .default(false)
    .describe("Require additional HR director/CEO countersignature"),
  introParagraph: z
    .string()
    .min(20, "Intro paragraph must be at least 20 characters")
    .max(2000, "Intro paragraph must not exceed 2000 characters")
    .default(
      `Dear [Candidate Name],\n\nWe are pleased to extend this formal offer of employment to you for the position of [Position Title] at [Company Name]. After careful consideration of your qualifications and interview performance, we believe you will be a valuable addition to our team.`
    ),
  closingParagraph: z
    .string()
    .min(20, "Closing paragraph must be at least 20 characters")
    .max(2000, "Closing paragraph must not exceed 2000 characters")
    .default(
      `We look forward to welcoming you to the [Company Name] team. Please sign and return this letter by the deadline indicated above to confirm your acceptance. Should you have any questions, please do not hesitate to contact us.\n\nBest regards,\n[HR Signatory Name]\n[HR Signatory Title]\n[Company Name]`
    ),
  ...BASE_SECTION_SCHEMA,
});

export type AcceptanceSigningType = z.infer<typeof AcceptanceSigningSchema>;

// ============================================================
// MASTER OFFER LETTER SETTINGS SCHEMA
// ============================================================
export const OfferLetterPhSchema = z.object({
  // Sections
  jobDetails: JobDetailsSchema,
  employmentTerms: EmploymentTermsSchema,
  compensation: CompensationSchema,
  benefitsPackage: BenefitsPackageSchema,
  conditionsContingencies: ConditionsContingenciesSchema,
  terminationLanguage: TerminationLanguageSchema,
  acceptanceSigning: AcceptanceSigningSchema,

  // Metadata
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  templateName: z
    .string()
    .max(100, "Template name must be 100 characters or less")
    .optional()
    .nullable(),
});

export type OfferLetterPhType = z.infer<typeof OfferLetterPhSchema>;

// ============================================================
// FLAT FORM DATA SCHEMA (for FormData serialization)
// ============================================================
export const OfferLetterPhFormDataSchema = z.object({
  // Job Details
  "jobDetails.officialTitle": z.string(),
  "jobDetails.department": z.string(),
  "jobDetails.supervisorName": z.string(),
  "jobDetails.supervisorTitle": z.string(),
  "jobDetails.jobResponsibilities": z.string(),

  // Employment Terms
  "employmentTerms.employmentStatus": z.string(),
  "employmentTerms.probationPeriod": z.string().transform((v) => (v ? parseInt(v) : 6)),
  "employmentTerms.startDate": z.string(),
  "employmentTerms.workSchedule": z.string(),
  "employmentTerms.workLocation": z.string(),

  // Compensation
  "compensation.monthlyBasicSalary": z.string().transform((v) => parseFloat(v)),
  "compensation.payFrequency": z.string(),
  "compensation.mandatory13thMonth": z.string().transform((v) => v === "true"),
  "compensation.performanceBonus": z.string().optional().transform((v) => (v ? parseFloat(v) : null)),
  "compensation.signingBonus": z.string().optional().transform((v) => (v ? parseFloat(v) : null)),
  "compensation.commissionStructure": z.string().optional(),
  "compensation.transportAllowance": z.string().optional().transform((v) => (v ? parseFloat(v) : null)),
  "compensation.mealAllowance": z.string().optional().transform((v) => (v ? parseFloat(v) : null)),
  "compensation.nightDifferential": z.string().optional().transform((v) => (v ? parseFloat(v) : null)),

  // Benefits
  "benefitsPackage.sssEnrolled": z.string().transform((v) => v === "true"),
  "benefitsPackage.philhealthEnrolled": z.string().transform((v) => v === "true"),
  "benefitsPackage.pagibigEnrolled": z.string().transform((v) => v === "true"),
  "benefitsPackage.serviceIncentiveLeave": z.string().transform((v) => (v ? parseInt(v) : 5)),
  "benefitsPackage.maternityPaternityLeave": z.string().transform((v) => v === "true"),
  "benefitsPackage.hmoProvider": z.string().optional(),
  "benefitsPackage.lifeInsurance": z.string().transform((v) => v === "true"),
  "benefitsPackage.vacationLeaveDays": z.string().transform((v) => (v ? parseInt(v) : 0)),
  "benefitsPackage.sickLeaveDays": z.string().transform((v) => (v ? parseInt(v) : 0)),
  "benefitsPackage.otherPerks": z.string().optional(),

  // Conditions
  "conditionsContingencies.nbiClearance": z.string().transform((v) => v === "true"),
  "conditionsContingencies.policeClearance": z.string().transform((v) => v === "true"),
  "conditionsContingencies.preEmploymentMedical": z.string().transform((v) => v === "true"),
  "conditionsContingencies.drugTest": z.string().transform((v) => v === "true"),
  "conditionsContingencies.torDiplomaVerification": z.string().transform((v) => v === "true"),
  "conditionsContingencies.ndaRequired": z.string().transform((v) => v === "true"),
  "conditionsContingencies.nonCompeteRequired": z.string().transform((v) => v === "true"),
  "conditionsContingencies.additionalConditions": z.string().optional(),

  // Termination
  "terminationLanguage.useStandardLaborCode": z.string().transform((v) => v === "true"),
  "terminationLanguage.customTerminationClause": z.string().optional(),

  // Acceptance & Signing
  "acceptanceSigning.acceptanceDeadlineDays": z.string().transform((v) => parseInt(v)),
  "acceptanceSigning.hrSignatoryName": z.string(),
  "acceptanceSigning.hrSignatoryTitle": z.string(),
  "acceptanceSigning.requireHrCountersignature": z.string().transform((v) => v === "true"),
  "acceptanceSigning.introParagraph": z.string(),
  "acceptanceSigning.closingParagraph": z.string(),
});

export type OfferLetterPhFormDataType = z.infer<typeof OfferLetterPhFormDataSchema>;
