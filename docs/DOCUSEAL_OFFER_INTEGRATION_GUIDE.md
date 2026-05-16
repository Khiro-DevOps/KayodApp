// ============================================================
// DOCUSEAL JOB OFFER INTEGRATION — IMPLEMENTATION GUIDE
// ============================================================

## Overview

This implementation integrates DocuSeal for automated job offer letter generation and digital signing in your multi-tenant ATS. Key features:

✅ **Automated Template Creation**: DocuSeal templates are created automatically when a job is published
✅ **Dynamic Customization**: HR can customize offer letters per job (intro message, additional terms, signing deadline, countersignature requirement)
✅ **Integrated into Job Form**: Offer letter settings are built into the existing job listing creation page
✅ **Digital Signing**: Candidates receive and sign offers via DocuSeal
✅ **Webhook Processing**: Automatic status updates when offers are accepted, declined, or expire
✅ **No Manual Template Management**: Templates live in Supabase, not in DocuSeal UI

---

## FILES CREATED/MODIFIED

### 1. Database Migration
**File**: `supabase/20260505_add_docuseal_offer_letter_columns.sql`

Adds these columns to the `job_postings` table:
- `docuseal_template_id` (TEXT) — DocuSeal template ID for this job's offer letter
- `offer_letter_settings` (JSONB) — Customization settings for the offer letter

Adds these columns to the `job_applications` table:
- `docuseal_submission_id` (TEXT) — DocuSeal submission ID for tracking signed offers
- `signed_at` (TIMESTAMPTZ) — When the candidate signed the offer
- `decline_reason` (TEXT) — Reason if candidate declined the offer

**Action Required**: Run this SQL in your Supabase SQL Editor before deploying.

---

### 2. DocuSeal Helper Functions
**File**: `lib/docuseal.ts`

#### New Exports:
- `buildOfferLetterHtml(job, tenant, settings?)` — Generates professional HTML for the offer letter
  - Includes company name, job details, salary range
  - Uses offer_letter_settings for customization
  - Renders signature blocks for candidate and optional HR countersignature
  - Returns HTML string ready for DocuSeal

- `createJobOfferTemplate(job, tenant, settings?)` — Creates a DocuSeal template
  - Calls DocuSeal REST API to create template with HTML
  - Sets up form fields for candidate_name, signature, date_signed
  - Adds HR fields if countersignature is enabled
  - Calculates expiration date from signingDeadlineDays
  - Returns template ID as string

- `OfferLetterSettings` (interface) — TypeScript type for offer customization
  - `introMessage?`: string
  - `additionalTerms?`: string
  - `signingDeadlineDays?`: number
  - `requireCountersignature?`: boolean

---

### 3. Updated Job Creation Action
**File**: `app/(dashboard)/jobs/actions.ts`

**Modified Functions**:
- `createJob()` — Now extracts and saves offer_letter_settings
  - Calls `createJobOfferTemplate()` after job is published
  - Saves template ID to job's `docuseal_template_id` column
  - Gracefully handles template creation errors (logs but doesn't block job publish)

- `updateJob()` — Updated to handle offer_letter_settings edits

**Form Fields Added**:
- `offer_intro_message` — Custom intro paragraph
- `offer_additional_terms` — Additional terms/conditions
- `offer_signing_deadline_days` — Number of days before offer expires
- `offer_require_countersignature` — Checkbox for HR signature requirement

---

### 4. New Job Offer Server Actions
**File**: `app/(dashboard)/jobs/manage/[id]/applicants/send-offer-actions.ts`

#### Exports:
- `sendJobOfferLetter(jobId, applicationId)` — Send offer to a candidate
  - Verifies job has docuseal_template_id
  - Creates DocuSeal submission with candidate email
  - Stores submission ID in `job_applications.docuseal_submission_id`
  - Updates application status to "offer_sent"
  - Creates notification for candidate
  - Returns submission URL for embedding

- `withdrawJobOfferLetter(applicationId, reason?)` — Withdraw an offer
  - Calls DocuSeal to cancel the submission
  - Updates application status back to "interviewed"
  - Clears docuseal_submission_id
  - Notifies candidate with optional reason
  - Handles 404 gracefully if already cancelled

---

### 5. DocuSeal Webhook Handler
**File**: `app/api/webhooks/docuseal/route.ts`

Listens for DocuSeal events and updates application status:

**Supported Events**:
- `submission.completed` → Application status: "offer_accepted"
- `submission.declined` → Application status: "offer_declined", stores reason
- `submission.expired` → Application status: "offer_expired"

**Features**:
- Always returns 200 OK to prevent DocuSeal retries
- Uses Supabase service role client for server-side operations
- Creates notifications for candidates on status changes
- Logs all events for debugging
- Gracefully handles missing submissions (already processed)

**Setup**:
1. Configure webhook URL in DocuSeal dashboard to: `https://yourdomain.com/api/webhooks/docuseal`
2. For local development with ngrok:
   ```bash
   ngrok http 3000
   # Then set webhook URL to: https://<ngrok-subdomain>.ngrok-free.app/api/webhooks/docuseal
   ```

---

### 6. Updated Job Form UI
**File**: `app/(dashboard)/jobs/manage/new/new-job-form-client.tsx`

Added "Offer Letter Settings (Optional)" collapsible section with:
- **Offer Letter Introduction** — Custom opening paragraph (textarea)
- **Additional Terms & Conditions** — Terms appended to offer (textarea)
- **Offer Signing Deadline** — Days before expiration (number input, default 7)
- **Require HR Countersignature** — Toggle for HR signature requirement (checkbox)

All fields are optional and collapsible. The section appears at the bottom of the form before the "Post Job" button.

---

## HOW IT WORKS — FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│ 1. HR Creates Job Listing                                   │
│    - Fills standard job form fields                         │
│    - Optionally expands "Offer Letter Settings"             │
│    - Customizes intro message, terms, deadline, etc.        │
│    - Clicks "Post Job"                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. createJob() Server Action                                │
│    - Saves job to Supabase with offer_letter_settings JSONB │
│    - Job is marked as published (is_published: true)        │
│    - Fetches HR user profile for company name               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Create DocuSeal Template (Automatic)                     │
│    - buildOfferLetterHtml() generates HTML from job data    │
│    - createJobOfferTemplate() calls DocuSeal API            │
│    - DocuSeal returns template ID                           │
│    - Template ID is saved to job_postings.docuseal_template_id │
│    - If fails, logs error but job is still published        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. HR Sends Offer to Candidate                              │
│    - HR navigates to /jobs/manage/[jobId]/applicants        │
│    - Selects candidate and clicks "Send Offer"              │
│    - Calls sendJobOfferLetter(jobId, applicationId)         │
│    - DocuSeal creates submission with candidate email       │
│    - Submission ID stored in job_applications               │
│    - Candidate receives email with signing link             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Candidate Signs/Declines Offer                           │
│    - Candidate opens signing link from email                │
│    - DocuSeal iframe for digital signature                  │
│    - Candidate signs or declines                            │
│    - DocuSeal sends webhook event to your server            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Webhook Handler Processes Event                          │
│    - Webhook received at /api/webhooks/docuseal             │
│    - Event type: submission.completed/declined/expired      │
│    - Looks up application by docuseal_submission_id         │
│    - Updates application status accordingly                 │
│    - Creates notification for candidate                     │
│    - Returns 200 OK immediately                             │
└─────────────────────────────────────────────────────────────┘
```

---

## SETUP CHECKLIST

### 1. Database
- [ ] Run SQL migration in Supabase SQL Editor
- [ ] Verify columns are added to `job_postings` and `job_applications` tables

### 2. Environment Variables
Ensure these are set in your `.env.local` or deployment environment:
```
DOCUSEAL_API_KEY=your_docuseal_api_key
DOCUSEAL_BASE_URL=https://api.docuseal.com
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=https://yourapp.com  # For redirect URLs
```

### 3. DocuSeal Webhook Configuration
- [ ] Log into DocuSeal dashboard
- [ ] Navigate to Settings → Webhooks
- [ ] Add webhook URL: `https://yourdomain.com/api/webhooks/docuseal`
- [ ] Select events: `submission.completed`, `submission.declined`, `submission.expired`
- [ ] Save and test webhook

### 4. Local Development (with ngrok)
If testing locally:
```bash
npm install -g ngrok

# In terminal 1: Start your app
npm run dev

# In terminal 2: Expose to internet
ngrok http 3000

# Get the ngrok URL (e.g., https://abc123.ngrok-free.app)
# Add to DocuSeal webhook: https://abc123.ngrok-free.app/api/webhooks/docuseal
```

### 5. Testing
- [ ] Create a test job with offer letter settings
- [ ] Verify job is published and docuseal_template_id is saved
- [ ] Receive a test application
- [ ] Send offer to test candidate
- [ ] Verify candidate receives email with signing link
- [ ] Sign the offer in DocuSeal
- [ ] Verify webhook updates application status to "offer_accepted"
- [ ] Check candidate notification was created

---

## API INTEGRATION DETAILS

### DocuSeal Template Creation

```typescript
POST https://api.docuseal.com/templates/html
Headers: X-Auth-Token: {DOCUSEAL_API_KEY}
Body: {
  name: "Company — Job Title Offer Letter",
  html: "...",
  fields: [
    { name: "candidate_name", role: "Candidate", type: "text" },
    { name: "signature", role: "Candidate", type: "signature" },
    { name: "date_signed", role: "Candidate", type: "date" },
    // If countersignature enabled:
    { name: "hr_signature", role: "HR", type: "signature" },
    { name: "hr_date_signed", role: "HR", type: "date" }
  ],
  expire_at: "2026-05-12T23:59:59Z"
}
```

### DocuSeal Submission Creation

```typescript
POST https://api.docuseal.com/submissions
Headers: X-Auth-Token: {DOCUSEAL_API_KEY}
Body: {
  template_id: 12345,
  send_email: true,
  submitters: [
    {
      role: "Candidate",
      name: "John Doe",
      email: "john@example.com",
      fields: [
        { name: "candidate_name", default_value: "John Doe" }
      ]
    }
  ],
  completed_redirect_url: "https://yourapp.com/applications/app-id"
}
```

### Webhook Payload

```typescript
{
  event_type: "submission.completed",  // or "submission.declined", "submission.expired"
  data: {
    external_id: "submission-id-123",
    completed_at: "2026-05-08T14:30:00Z",
    decline_reason: null,  // Only for declined events
    submission: {
      id: 999,
      status: "completed",
      combined_document_url: "https://..."
    }
  }
}
```

---

## TROUBLESHOOTING

### Problem: "DocuSeal template not found for this job"
**Solution**: 
- Verify the job was published with `is_published: true`
- Check that `DOCUSEAL_API_KEY` is configured
- Review server logs for template creation errors
- Try republishing the job

### Problem: Candidate doesn't receive offer email
**Solution**:
- Verify candidate email is saved in profiles table
- Check DocuSeal dashboard for delivery logs
- Ensure `send_email: true` in submission creation
- Check spam/junk folder

### Problem: Webhook doesn't update status
**Solution**:
- Verify webhook URL is correct in DocuSeal dashboard
- Check server logs at `/api/webhooks/docuseal`
- Ensure `docuseal_submission_id` is saved on the application
- For ngrok: URLs change on restart — update DocuSeal webhook config
- Test webhook manually in DocuSeal dashboard

### Problem: HTML formatting looks wrong in DocuSeal
**Solution**:
- Review the generated HTML in `buildOfferLetterHtml()`
- Check browser DevTools to inspect actual HTML sent
- Ensure placeholders like `{{candidate_name}}` are present
- DocuSeal requires inline styles, not external CSS

---

## DEPLOYMENT NOTES

### Production Considerations

1. **Webhook Security** (Optional but Recommended)
   - Consider adding a secret header verification to webhook
   - DocuSeal sends: `X-Docuseal-Signature` header
   - Verify signature before processing

2. **Error Handling**
   - Webhook always returns 200 to prevent retries
   - Errors are logged but don't break the flow
   - Monitor server logs for DocuSeal API failures

3. **Rate Limiting**
   - DocuSeal may have rate limits
   - Stagger template creation if bulk-creating jobs
   - Cache template data to avoid redundant API calls

4. **Monitoring**
   - Track template creation success/failure rates
   - Monitor webhook processing latency
   - Alert on DocuSeal API errors

---

## NEXT STEPS

### Optional Enhancements

1. **Email Templates**: Customize candidate notification emails
2. **PDF Download**: Add ability for HR to download signed offers
3. **Countersignature**: Implement HR approval workflow before sending
4. **Bulk Operations**: Send offers to multiple candidates at once
5. **Analytics**: Track offer acceptance rates and timing
6. **Expiry Reminders**: Send reminders before offers expire

### Integration Points

- HR Evaluation Sidebar: Import `sendJobOfferLetter` and `withdrawJobOfferLetter`
- Application Detail View: Show offer status and signing links
- Notifications System: Already integrated for candidate updates
- Reporting: Query applications by `status` to track offers

---

## FILE SUMMARY

| File | Purpose | Type |
|------|---------|------|
| `supabase/20260505_add_docuseal_offer_letter_columns.sql` | Database schema migration | SQL |
| `lib/docuseal.ts` | Helper functions for template/submission creation | TypeScript |
| `app/(dashboard)/jobs/actions.ts` | Updated job creation with template generation | TypeScript |
| `app/(dashboard)/jobs/manage/[id]/applicants/send-offer-actions.ts` | Send/withdraw offer server actions | TypeScript |
| `app/api/webhooks/docuseal/route.ts` | Webhook handler for DocuSeal events | TypeScript |
| `app/(dashboard)/jobs/manage/new/new-job-form-client.tsx` | Updated job form with offer settings UI | TypeScript React |

---

## CODE EXAMPLES

### Example 1: Send an offer to a candidate
```typescript
import { sendJobOfferLetter } from "@/app/(dashboard)/jobs/manage/[id]/applicants/send-offer-actions";

const result = await sendJobOfferLetter(jobId, applicationId);
if (result.success) {
  // Offer sent successfully
  console.log("Submission URL:", result.submissionUrl);
  // Display to candidate or redirect
} else {
  console.error("Error:", result.error);
}
```

### Example 2: Withdraw an offer
```typescript
import { withdrawJobOfferLetter } from "@/app/(dashboard)/jobs/manage/[id]/applicants/send-offer-actions";

const result = await withdrawJobOfferLetter(applicationId, "Position filled");
if (result.success) {
  console.log("Offer withdrawn");
  // Refresh UI
} else {
  console.error("Error:", result.error);
}
```

### Example 3: Access offer letter settings
```typescript
const { data: job } = await supabase
  .from("job_postings")
  .select("offer_letter_settings, docuseal_template_id")
  .eq("id", jobId)
  .single();

console.log(job.offer_letter_settings);
// Output:
// {
//   introMessage: "Dear candidate...",
//   additionalTerms: "Relocation assistance available...",
//   signingDeadlineDays: 7,
//   requireCountersignature: true
// }
```

---

## SUPPORT & RESOURCES

- **DocuSeal Docs**: https://docuseal.com/docs
- **DocuSeal API**: https://docuseal.com/api
- **Supabase Docs**: https://supabase.com/docs
- **Next.js Server Actions**: https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions

---

**Implementation Complete!** 🎉

All components are now in place for automated DocuSeal job offer letter generation and digital signing in your ATS.
