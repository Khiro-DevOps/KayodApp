# Job Offer Page - Complete Implementation Guide

## Overview
This document describes the complete Job Offer Page feature implementation for Kayod HRIS, covering the full offer lifecycle from HR sending an offer to the applicant signing the contract.

## Database Schema

### Tables Created

#### 1. `job_offers`
Stores all job offer records with terms, status, and DocuSeal integration.

**Key Fields:**
- `id`: UUID primary key
- `application_id`: FK to applications (unique)
- `applicant_id`: FK to profiles (the candidate)
- `hr_id`: FK to profiles (the HR user who created the offer)
- `template_id`: DocuSeal template ID
- `submission_id`: DocuSeal submission ID (set when applicant accepts)
- `signed_pdf_url`: URL to signed PDF (from DocuSeal webhook)
- `status`: `pending | accepted | negotiating | declined | expired`
- `version`: Increments on each revision (default 1)
- `terms`: JSON object with salary, employment type, start date, work arrangement, etc.
- `expires_at`: Expiry deadline
- `issued_at`: When offer was sent
- `viewed_at`: When applicant first viewed the offer
- `accepted_at`: When applicant signed
- `negotiation_round`: Current negotiation round (0-3)

#### 2. `negotiation_requests`
Tracks all negotiation rounds per offer.

**Key Fields:**
- `id`: UUID primary key
- `offer_id`: FK to job_offers
- `round`: 1, 2, or 3
- `submitted_by`: FK to profiles (applicant)
- `items`: JSON array of negotiation items
- `status`: `pending | approved | countered | declined`
- `hr_response`: JSON object with HR's response per item
- `submitted_at`: When negotiation was submitted
- `responded_at`: When HR responded

## API Routes

### `POST /api/docuseal/offer-webhook`
Handles DocuSeal webhooks for offer signing completion and decline events.

**Webhook Payload:**
```json
{
  "event_type": "form.completed" | "form.declined",
  "data": {
    "submission": {
      "id": 123,
      "url": "...",
      "combined_document_url": "..."
    },
    "decline_reason": "..."
  }
}
```

**On Completion:**
- Updates offer status to `accepted`
- Saves signed PDF URL
- Notifies HR
- Updates application status to `hired`

**On Decline:**
- Updates offer status to `declined`
- Notifies HR with decline reason

## Server Actions

Located in: `app/(dashboard)/job-offers/job-offer-actions.ts`

### 1. `createJobOffer(applicationId, terms, expiryDays)`
Creates and sends a job offer to a candidate.

**Parameters:**
- `applicationId`: ID of the application
- `terms`: JobOfferTerms object
- `expiryDays`: Days until offer expires (default: 7)

**Returns:** `{ success, offerId, error }`

**Side Effects:**
- Creates JobOffer record
- Sends notification to applicant (routed to `/job-offer/{offerId}`)
- Updates application status to `offer_sent`

### 2. `markOfferViewed(offerId)`
Records when applicant first views the offer (auto-called on page load).

### 3. `submitNegotiation(offerId, items)`
Applicant submits negotiation request.

**Constraints:**
- Max 3 negotiation rounds per offer
- Each item must have term, requestedValue, and reason

**Side Effects:**
- Creates NegotiationRequest record
- Updates offer status to `negotiating`
- Updates negotiation_round counter
- Notifies HR

### 4. `acceptOffer(offerId)`
Applicant accepts the offer and initiates DocuSeal signing.

**Side Effects:**
- Creates DocuSeal submission
- Saves submission_id to offer
- Notifies HR that signing has started

### 5. `declineOffer(offerId)`
Applicant declines the offer.

**Side Effects:**
- Updates offer status to `declined`
- Updates application status to `rejected`
- Notifies HR

### 6. `respondToNegotiation(negotiationId, hrResponse)`
HR responds to negotiation request with approve/counter/decline per item.

**Response Format:**
```json
{
  "0": { "action": "approve" | "counter" | "decline", "counterValue": "...", "notes": "..." },
  "1": { "action": "decline" }
}
```

**Side Effects:**
- Updates negotiation status
- If countered: revises offer (increments version, sets status to pending)
- Notifies applicant of HR response

### 7. `revokeOffer(offerId)`
HR revokes an offer (cannot revoke if already accepted).

**Side Effects:**
- Updates offer status to `declined`
- Updates application status to `rejected`
- Notifies applicant

### 8. `processDocuSealCompletion(submissionId, submissionUrl, signedPdfUrl)`
Called by webhook handler when signing completes.

**Side Effects:**
- Updates offer status to `accepted`
- Saves signed PDF URL
- Updates application status to `hired`
- Notifies HR

## UI Components

### 1. **Job Offer Page** (`app/(dashboard)/job-offer/[offerId]/page.tsx`)
Main SSR page that:
- Fetches offer and checks access permissions
- Marks offer as viewed
- Renders different UIs for applicants vs HR

### 2. **JobOfferHeader** (`components/job-offer/job-offer-header.tsx`)
Displays:
- Job title and applicant name
- Status badge with expiry countdown
- Timeline info (issued, viewed, signed dates)

### 3. **JobOfferTermsPanel** (`components/job-offer/job-offer-terms-panel.tsx`)
Shows all offer terms with expandable/collapsible UI:
- Salary and currency
- Employment type
- Start date and work arrangement
- Department and direct manager
- Benefits list
- Additional notes

### 4. **JobOfferPdfPanel** (`components/job-offer/job-offer-pdf-panel.tsx`)
Displays:
- Embedded PDF preview in iframe
- Download button
- Skeleton loader while loading

### 5. **ApplicantActionPanel** (`components/job-offer/applicant-action-panel.tsx`)
Applicant controls:
- Accept button → initiates DocuSeal signing
- Decline button (with confirmation)
- Negotiate button → opens negotiation form
- Status-specific messages (accepted, declined, expired)
- Negotiation round counter

### 6. **NegotiationForm** (`components/job-offer/negotiation-form.tsx`)
Allows applicant to:
- Add up to 3 negotiation items
- Select term to negotiate
- See current value (read-only)
- Enter requested value and reason
- Submit negotiation request

### 7. **DocuSealEmbed** (`components/job-offer/docuseal-embed.tsx`)
Embeds DocuSeal signing form inline:
- iFrame with submission URL
- Completion handled by webhook

### 8. **HRActionPanel** (`components/job-offer/hr-action-panel.tsx`)
HR controls:
- Activity timeline (sent, viewed, negotiation, signed)
- Download signed contract button (if accepted)
- Revoke offer button (with confirmation)
- Negotiation response section (if negotiating)

### 9. **NegotiationResponsePanel** (`components/job-offer/negotiation-response-panel.tsx`)
HR responds to negotiation:
- Shows all pending negotiation requests
- For each item: approve/counter/decline options
- Counter option requires value
- Optional notes field
- Submits all responses at once

## Scheduled Jobs

### Offer Expiry Job (`20260506_add_offer_expiry_job.sql`)
- Runs daily at 00:30 UTC
- Marks offers as expired if `expires_at < now()`
- Notifies HR of expirations
- Trigger fires notification when status changes to expired

## Integration with Application Detail

To add "Send Offer" button to the application detail page:

```tsx
// In app/(dashboard)/applications/[id]/page.tsx or similar
import { createJobOffer } from "@/app/(dashboard)/job-offers/job-offer-actions";

// In the HR evaluation sidebar, add a button:
<button
  onClick={async () => {
    const result = await createJobOffer(applicationId, {
      salary: 100000,
      currency: "PHP",
      employmentType: "full-time",
      startDate: new Date().toISOString(),
      workArrangement: "hybrid",
      department: "Engineering",
      manager: "John Doe",
      benefits: ["Health Insurance", "401k", "Flexible Hours"],
      notes: "Competitive offer based on market research"
    }, 7);
    
    if (result.success) {
      toast.success("Offer sent!");
      router.push(`/job-offer/${result.offerId}`);
    }
  }}
>
  Send Offer
</button>
```

## Notification Routing

All job offer notifications now route to `/job-offer/{offerId}` instead of `/pipeline` or `/applications`:

**Notification Types:**
- `offer_sent`: Sent when HR creates offer
- `offer_accepted`: Sent when applicant starts signing
- `offer_declined`: Sent when applicant declines
- `offer_negotiation_submitted`: Sent when applicant negotiates
- `offer_negotiation_responded`: Sent when HR responds to negotiation

## Environment Variables Required

```env
DOCUSEAL_API_KEY=your_api_key
DOCUSEAL_BASE_URL=https://api.docuseal.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Database Migrations

Run these migrations in order:

1. `20260506_add_job_offer_management.sql` - Creates tables and RLS policies
2. `20260506_add_offer_expiry_job.sql` - Creates scheduled job and trigger

## Testing Workflow

### Test Full Accept Flow
1. HR creates offer from application detail
2. Applicant receives notification → clicks → views offer
3. Applicant clicks "Accept Offer"
4. DocuSeal form opens
5. Applicant completes signing
6. Webhook fires → offer marked as accepted → HR notified

### Test Negotiation Flow
1. Applicant clicks "Negotiate"
2. Fills in negotiation items (max 3)
3. HR receives notification
4. HR opens offer page → expands negotiation section
5. HR responds to each item (approve/counter/decline)
6. Applicant receives notification with response
7. If countered: offer version increments, status back to pending

### Test Expiry
1. Create offer with past expiry date
2. Scheduled job runs (or manually call `expire_job_offers()`)
3. Offer marked as expired
4. HR receives notification
5. Page shows expired banner

## Mobile Responsiveness

All components are responsive:
- PDF viewer scales to mobile screens
- Negotiation form is touch-friendly
- Action panels stack properly on small screens
- Buttons have adequate touch targets (min 44px)

## Error Handling

All server actions return `{ success, error }` objects:
- Network errors are caught
- Validation errors are returned
- User-friendly error messages in toasts
- Errors logged to console

## RLS Policies

**job_offers:**
- Applicants can view/update their own offers
- HR can view/update offers they created
- HR can insert new offers

**negotiation_requests:**
- Applicants can view/insert for their offers
- HR can view/update for their offers

## Next Steps

1. Test the full workflow end-to-end
2. Configure DocuSeal webhook URL in DocuSeal dashboard to point to `/api/docuseal/offer-webhook`
3. Add "Send Offer" button to application detail page
4. Monitor scheduled jobs in Supabase
5. Customize notification messages as needed
