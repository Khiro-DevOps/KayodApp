# Philippine-Compliant Offer Letter Module - Implementation Guide

## Overview

This module provides a complete 7-section collapsible interface for creating Philippine-compliant job offer letters in compliance with:

- **Art. 281** (Labor Code): Probation max 6 months (180 days)
- **P.D. 851**: Mandatory 13th month pay
- **RA 7875**: Mandatory SSS, PhilHealth, Pag-IBIG enrollment
- **RA 11165**: Night differential minimum 10%
- **PH Labor Code**: Termination only for just or authorized cause

## Architecture

### File Structure

```
lib/
  schemas/
    offer-letter-ph.ts                 # Zod validation schemas
  offer-letter-ph-utils.ts             # Utilities for form handling & mapping

components/
  offer-letter-ph/
    offer-letter-ph-accordion.tsx       # Main accordion wrapper
    sections/
      job-details-section.tsx           # Section 1
      employment-terms-section.tsx      # Section 2
      compensation-section.tsx          # Section 3
      benefits-package-section.tsx      # Section 4
      conditions-contingencies-section.tsx  # Section 5
      termination-language-section.tsx  # Section 6
      acceptance-signing-section.tsx    # Section 7
```

## Integration Steps

### 1. Update Job Creation Form

In `new-job-form-client.tsx`, add the accordion component:

```tsx
import OfferLetterPhAccordion from "@/components/offer-letter-ph/offer-letter-ph-accordion";

export default function NewJobForm() {
  const [offerLetterValues, setOfferLetterValues] = useState({});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={createJob} ref={formRef} className="space-y-4">
      {/* Existing fields */}
      <input name="title" ... />
      
      {/* Offer Letter Settings - New Section */}
      <div className="mt-8 border-t border-[#333] pt-8">
        <OfferLetterPhAccordion
          initialValues={offerLetterValues}
          onValuesChange={setOfferLetterValues}
          formRef={formRef}
        />
      </div>

      <button type="submit">Create Job & Offer Template</button>
    </form>
  );
}
```

### 2. Update Server Action (createJob)

Modify `app/(dashboard)/jobs/actions.ts`:

```typescript
import { formatOfferLetterPhForDocuSeal, validateOfferLetterPhFormData } from "@/lib/offer-letter-ph-utils";

export async function createJob(formData: FormData) {
  // ... existing code ...

  // Extract offer letter settings
  const offerLetterFormData = Object.fromEntries(
    Array.from(formData.entries()).filter(([key]) => 
      key.startsWith("jobDetails.") ||
      key.startsWith("employmentTerms.") ||
      // ... etc for all sections
    )
  );

  const validation = validateOfferLetterPhFormData(offerLetterFormData);
  
  if (!validation.success) {
    return redirect(`/jobs/manage/new?error=${encodeURIComponent(
      Object.values(validation.errors || {}).join(", ")
    )}`);
  }

  // Format for DocuSeal
  const offerLetterSettings = formatOfferLetterPhForDocuSeal(validation.data);

  // Create job with offer letter settings
  const { data: jobData, error } = await adminClient
    .from("job_postings")
    .insert({
      // ... existing fields ...
      offer_letter_settings: offerLetterSettings,
    })
    .select("id")
    .single();

  // ... rest of the function ...
}
```

### 3. Database Schema (if not already present)

Ensure `job_postings` table has:

```sql
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS 
  offer_letter_settings JSONB DEFAULT NULL;
```

## Section Details

### Section 1: Job Details (Required)
- **Official Job Title**: Position name for the contract
- **Department**: Organizational unit
- **Supervisor Name & Title**: Direct reporting line
- **Job Responsibilities**: Role description for the offer letter

### Section 2: Employment Terms - PH Compliance (Required)
- **Employment Status**: Regular, Probationary, Project-based, Seasonal, Casual
- **Probation Period**: Auto-validates ≤ 180 days (Art. 281)
- **Start Date**: Employment commencement date
- **Work Schedule**: Hours and shift information
- **Work Location**: Office, remote, or hybrid arrangement

### Section 3: Compensation - PHP Currency (Required)
- **Monthly Basic Salary**: Primary compensation
- **Pay Frequency**: Monthly, Semi-monthly, Weekly
- **13th Month Pay**: Mandatory toggle (P.D. 851)
- **Performance/Signing Bonuses**: Optional incentives
- **Commission Structure**: For sales/variable roles
- **Allowances**: Transport and meal allowances
- **Night Differential**: Minimum 10% validation (RA 11165)

### Section 4: Benefits Package (Required)
**Mandatory Benefits** (Green-highlighted):
- SSS (Social Security System)
- PhilHealth
- Pag-IBIG (HDMF)
- Service Incentive Leave (SIL) - minimum 5 days
- Maternity/Paternity Leave

**Optional Company Benefits**:
- HMO Provider (Maxicare, Intellicare, etc.)
- Group Life Insurance
- Vacation/Sick Leave days
- Other perks (WiFi, gym, training budget, etc.)

### Section 5: Conditions & Contingencies (Optional)
- NBI Clearance
- Police Clearance
- Pre-employment Medical
- Drug Test (DOLE-compliant)
- TOR/Diploma Verification
- NDA
- Non-compete Clause
- Custom conditions

### Section 6: Termination Language - Strict PH Law (Required)
Two options:
1. **Standard Labor Code Language** (Recommended)
   - References Art. 282 (just cause) and Art. 283 (authorized cause)
   - Ensures full compliance with PH Labor Law
   - Cannot be modified
   
2. **Custom Clause** (with warning)
   - Must comply with Labor Code
   - Recommended to have legal counsel review

### Section 7: Acceptance & Signing (Required)
- **Acceptance Deadline**: Days from issuance (1-90)
- **HR Signatory**: Name and title
- **HR Countersignature**: Optional second approval
- **Intro Paragraph**: Opening greeting with placeholders
- **Closing Paragraph**: Closing remarks with signature block

Placeholders supported:
- `[Candidate Name]`
- `[Position Title]`
- `[Company Name]`
- `[HR Signatory Name]`
- `[HR Signatory Title]`

## Validation Rules

### Zod Schema Validations

| Field | Rule |
|-------|------|
| Probation Period | Max 180 days (Art. 281) - triggers warning |
| Monthly Salary | Must be > 0 and finite |
| Night Differential | Min 10%, max 100% (RA 11165) |
| Service Leave | Min 5 days (RA 7875) |
| Acceptance Deadline | 1-90 days |
| Job Responsibilities | Min 10, max 2000 chars |

## Styling

### Dark Theme Colors
- Background: `#1a1a1a`
- Secondary: `#121212`
- Border: `#333`
- Text Primary: `text-text-primary`
- Text Secondary: `text-text-secondary`

### Badge Styling
- **Required**: Red badge (`bg-red-500/10 text-red-400`)
- **Optional**: Blue badge (`bg-blue-500/10 text-blue-400`)
- **Mandatory Benefits**: Green border/highlight

## Form Data Submission

The component uses standard HTML form fields with nested naming convention:

```
jobDetails.officialTitle = "Senior Software Engineer"
employmentTerms.employmentStatus = "regular"
compensation.monthlyBasicSalary = "150000"
benefitsPackage.sssEnrolled = "true"
...
```

Use `validateOfferLetterPhFormData()` to parse and validate all fields at once.

## Integration with DocuSeal

The `formatOfferLetterPhForDocuSeal()` utility converts the form data to a DocuSeal template payload:

```typescript
const docuSealPayload = formatOfferLetterPhForDocuSeal(offerLetterData);
const templateId = await createJobOfferTemplate(jobInfo, docuSealPayload);
```

## Compliance Checkpoints

✅ **Art. 281 Compliance**: Probation period validation
✅ **P.D. 851 Compliance**: 13th month mandatory toggle
✅ **RA 7875 Compliance**: Mandatory benefits enforcement
✅ **RA 11165 Compliance**: Night differential minimum validation
✅ **Labor Code Compliance**: Termination language enforcement (no "at-will")

## Error Handling

All validation errors are returned as a structured object:

```typescript
{
  "jobDetails.officialTitle": "Official job title is required",
  "compensation.nightDifferential": "Night differential must be at least 10%",
  "employmentTerms.probationPeriod": "Probation cannot exceed 180 days"
}
```

## Future Enhancements

1. **Multi-language Support**: Tagalog translations
2. **Template Library**: Pre-filled templates for common roles
3. **Batch Upload**: Import offer letters from CSV
4. **Audit Trail**: Track changes to offer letter settings
5. **Email Preview**: Show how offer letter will appear to candidate
6. **PDF Export**: Generate PDF preview before DocuSeal submission
