// ============================================================
// DOCUSEAL INTEGRATION — QUICK START REFERENCE
// ============================================================

## 🚀 IMMEDIATE ACTIONS REQUIRED

### Step 1: Run Database Migration
**In Supabase SQL Editor:**
```sql
-- Copy and paste the entire contents of:
-- supabase/20260505_add_docuseal_offer_letter_columns.sql
-- Then execute
```

### Step 2: Verify Environment Variables
**In your `.env.local` or deployment settings:**
```
DOCUSEAL_API_KEY=xxx
DOCUSEAL_BASE_URL=https://api.docuseal.com
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or your domain
```

### Step 3: Configure DocuSeal Webhook
**In DocuSeal Dashboard (Settings > Webhooks):**
```
Webhook URL: https://yourdomain.com/api/webhooks/docuseal
Events: submission.completed, submission.declined, submission.expired
```

### Step 4: Deploy Changes
- All new files have been created
- Existing files (`app/(dashboard)/jobs/actions.ts`, job form) have been updated
- Tests: Create a new job, verify docuseal_template_id is set in database

---

## 📋 WORKFLOW FOR HR

### Creating a Job with Custom Offer Letter

1. Navigate to `/jobs/manage/new`
2. Fill in all standard job fields (title, description, etc.)
3. **Scroll down** to see "📄 Offer Letter Settings (Optional)"
4. Click to expand the section
5. Customize (all optional):
   - **Intro Message**: Custom opening paragraph
   - **Additional Terms**: Special conditions for this position
   - **Signing Deadline**: Days before offer expires (default: 7)
   - **HR Countersignature**: Toggle if HR must also sign
6. Click "Post Job"
7. System automatically creates DocuSeal template in background

### Sending an Offer to a Candidate

1. Navigate to `/jobs/manage/[job-id]/applicants`
2. Find candidate in list
3. Click "Send Offer" button
4. Confirmation message shows
5. Candidate receives email with DocuSeal signing link
6. Application status becomes "offer_sent"

### Withdrawing an Offer

1. On candidate's application page
2. Click "Withdraw Offer" button
3. Optional: Enter reason for withdrawal
4. Application status reverts to "interviewed"
5. Candidate receives notification

---

## 🔧 KEY FILES REFERENCE

| What | Where | Action |
|------|-------|--------|
| SQL Migration | `supabase/20260505_add_docuseal_offer_letter_columns.sql` | Run in Supabase SQL Editor |
| Helper Functions | `lib/docuseal.ts` | Auto-imported, no changes needed |
| Job Creation Logic | `app/(dashboard)/jobs/actions.ts` | Already updated |
| Send Offer Logic | `app/(dashboard)/jobs/manage/[id]/applicants/send-offer-actions.ts` | Import and use |
| Webhook Handler | `app/api/webhooks/docuseal/route.ts` | No changes needed after deploy |
| Job Form UI | `app/(dashboard)/jobs/manage/new/new-job-form-client.tsx` | Already updated |

---

## 💾 DATABASE SCHEMA

### job_postings Table (new columns)
```sql
docuseal_template_id    TEXT        -- DocuSeal template ID
offer_letter_settings   JSONB       -- Customization settings
```

### job_applications Table (new columns)
```sql
docuseal_submission_id  TEXT        -- DocuSeal submission ID
signed_at               TIMESTAMPTZ -- When candidate signed
decline_reason          TEXT        -- If declined
```

### offer_letter_settings JSONB Structure
```json
{
  "introMessage": "Dear [candidate_name]...",
  "additionalTerms": "Relocation assistance available...",
  "signingDeadlineDays": 7,
  "requireCountersignature": true
}
```

---

## 🔌 API ENDPOINTS

### Creating a Job (Existing + Enhanced)
```
POST /app/(dashboard)/jobs/actions.ts (server action)
FormData:
  - title, industry, description, work_setup, etc. (existing)
  - offer_intro_message (optional)
  - offer_additional_terms (optional)
  - offer_signing_deadline_days (optional, default: 7)
  - offer_require_countersignature (optional, "true"/"false")

Response:
  - Redirects to /jobs/manage on success
  - Job is published with docuseal_template_id set
```

### Sending an Offer (New)
```
Server Action: sendJobOfferLetter(jobId, applicationId)
Returns: {
  success: boolean,
  error?: string,
  submissionUrl?: string
}
```

### Withdrawing an Offer (New)
```
Server Action: withdrawJobOfferLetter(applicationId, reason?)
Returns: {
  success: boolean,
  error?: string
}
```

### Webhook Handler (New)
```
POST /api/webhooks/docuseal
Body (from DocuSeal):
  {
    event_type: "submission.completed|declined|expired",
    data: {
      external_id: "submission-id",
      ...
    }
  }

Response:
  - Always returns 200 OK
  - Updates application status
  - Creates notification
```

---

## ✅ TESTING CHECKLIST

### Local Testing (Before Deploy)
- [ ] Database migration runs without errors
- [ ] Environment variables are set
- [ ] App starts without build errors
- [ ] Create a new job → verify `docuseal_template_id` in database
- [ ] Update job with custom offer settings → verify `offer_letter_settings` saved

### Full Flow Testing
- [ ] HR creates job with offer letter customization
- [ ] System generates DocuSeal template
- [ ] HR sends offer to candidate
- [ ] Candidate receives email from DocuSeal
- [ ] Candidate opens link and signs
- [ ] Webhook fires and updates application status to "offer_accepted"
- [ ] Both HR and candidate receive notifications

### Edge Cases
- [ ] Withdraw offer before candidate signs
- [ ] Offer expires (after deadline passes)
- [ ] Candidate declines offer
- [ ] Multiple offers to same candidate
- [ ] Resend offer to same candidate

---

## 🚨 COMMON ISSUES & FIXES

| Issue | Cause | Fix |
|-------|-------|-----|
| "Offer template not found" | Job not published or template creation failed | Republish job, check server logs |
| Candidate doesn't get email | Email not in profiles table | Verify candidate.email in database |
| Webhook doesn't fire | Webhook URL incorrect or ngrok URL expired | Update DocuSeal webhook config |
| Status doesn't update | submission_id not saved on application | Check send-offer-actions.ts logs |
| HTML formatting broken | Inline styles not applied | Check buildOfferLetterHtml() styling |

---

## 📊 MONITORING & DEBUGGING

### Check Job Template Status
```typescript
const { data: job } = await supabase
  .from("job_postings")
  .select("title, docuseal_template_id, offer_letter_settings")
  .eq("id", jobId)
  .single();

console.log(job);
// If docuseal_template_id is null, template creation failed
```

### Check Offer Status
```typescript
const { data: app } = await supabase
  .from("job_applications")
  .select("status, docuseal_submission_id, signed_at")
  .eq("id", applicationId)
  .single();

console.log(app);
// status: "offer_sent" = waiting for signature
// status: "offer_accepted" = signed by candidate
```

### View Server Logs
```bash
# DocuSeal template creation
grep "DocuSeal template creation" logs

# SendJobOffer action
grep "Error sending job offer" logs

# Webhook processing
grep "DocuSeal Webhook" logs
```

---

## 🔐 SECURITY NOTES

✅ **Already Implemented:**
- Service role key used for server-side operations (not anon key)
- RLS policies on job_postings and job_applications
- HR can only send offers for jobs they created
- Candidates can only view/sign their own offers

⚠️ **Recommendations:**
- Validate DocuSeal webhook signature (optional security enhancement)
- Rate-limit webhook endpoint if high volume
- Monitor for suspicious offer activity (duplicate sends, etc.)
- Audit log all offer state changes

---

## 📱 UI INTEGRATION POINTS

### HR Evaluation Sidebar
To add "Send Offer" button to candidate list, add to evaluation sidebar:
```typescript
import { sendJobOfferLetter } from "@/app/(dashboard)/jobs/manage/[id]/applicants/send-offer-actions";

// In your button click handler:
const result = await sendJobOfferLetter(jobId, applicationId);
if (result.success) {
  // Show success message
}
```

### Application Detail Page
Show offer status and signing link:
```typescript
if (application.status === "offer_sent" && application.docuseal_submission_id) {
  // Show "Pending candidate signature" badge
  // Show link to signing page if available
}
if (application.status === "offer_accepted") {
  // Show "Offer Accepted" badge with signed_at date
}
```

---

## 📞 SUPPORT

- **Errors in logs**: Search for "DocuSeal" or "offer" in server logs
- **Database queries**: Use Supabase SQL Editor to debug
- **Webhook testing**: Use DocuSeal dashboard to manually trigger test events
- **DocuSeal support**: contact@docuseal.com or https://docuseal.com/contact

---

## ✨ SUMMARY

**You now have:**
- ✅ Fully automated DocuSeal template creation on job publish
- ✅ Customizable offer letters per job (intro, terms, deadline, HR sign)
- ✅ Server actions to send/withdraw offers
- ✅ Webhook handler for offer status updates
- ✅ UI integration in job creation form
- ✅ Full type safety with TypeScript
- ✅ Multi-tenant support (templates per job, per tenant)

**Next deployment checklist:**
1. [ ] Run SQL migration
2. [ ] Verify env vars
3. [ ] Deploy code
4. [ ] Configure DocuSeal webhook
5. [ ] Test full flow
6. [ ] Monitor logs for errors

---

**Ready to go live!** 🚀
