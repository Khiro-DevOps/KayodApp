# Notification System Debugging Guide

## Problem Summary
The job offer notification system was broken due to multiple issues preventing candidates from receiving notifications and seeing offers on their dashboard.

## Root Causes Fixed

### 1. **Missing Database Trigger** ✅
- **Issue**: No database trigger existed to create notifications when `job_offers.status` changed to `'SENT'`
- **Solution**: Created `trg_notify_job_offer_status` trigger in `20260513_add_job_offer_notification_trigger.sql`
- **What it does**: Automatically creates a notification record when:
  - Offer status changes to `'SENT'` → notifies candidate
  - Offer status changes to `'ACCEPTED'` → notifies HR/recruiter
  - Offer status changes to `'DECLINED'` → notifies HR/recruiter

### 2. **Status Enum Mismatch** ✅
- **Issue**: `sendHydratedOffer()` was creating offers with lowercase `status: "pending"` instead of uppercase `"DRAFT"`
- **Solution**: Updated `offer-actions.ts` to use `status: "DRAFT"` (matches the `offer_status` ENUM)
- **File**: `app/(auth)/actions/offer-actions.ts`

### 3. **Missing Application ID in DocuSeal Metadata** ✅
- **Issue**: The `external_id` field wasn't being sent to DocuSeal, so webhooks couldn't map submissions back to applications
- **Solution**: Added `external_id: applicationId` to the submitters payload in `send-offer-actions.ts`
- **Why it matters**: DocuSeal webhooks now have the `external_id` field to identify which application the submission belongs to

### 4. **No Visibility Into Notification Creation** ✅
- **Issue**: No logging to verify if notifications were actually being created
- **Solution**: Added comprehensive console logging throughout the flow to track:
  - Offer creation start/completion
  - DocuSeal API responses
  - Job offers table updates
  - Notification creation verification

## How the Notification Flow Works (After Fixes)

```
1. HR clicks "Send Offer" in Review Board
   ↓
2. sendHydratedOffer() creates job_offers record with status='DRAFT'
   ↓
3. sendJobOfferLetter() called to send via DocuSeal
   ↓
4. DocuSeal submission created with external_id=applicationId
   ↓
5. job_offers.status updated to 'SENT'
   ↓
6. Database trigger trg_notify_job_offer_status fires
   ↓
7. Notification record created for candidate
   ↓
8. Candidate sees notification on dashboard
   ↓
9. Candidate clicks notification → sees offer details
   ↓
10. Candidate signs document via DocuSeal embed
   ↓
11. DocuSeal webhook fires when document signed
   ↓
12. Webhook handler updates job_offers.status to 'ACCEPTED'
   ↓
13. Trigger fires again → HR/recruiter gets notification
```

## Verification Checklist

### Step 1: Verify Database Changes
Run in Supabase SQL Editor:
```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'trg_notify_job_offer_status';

-- Check offer_status enum values
SELECT unnest(enum_range(NULL::offer_status));
```

### Step 2: Check Application Logs
After sending an offer, check browser console and server logs for:
```
[sendHydratedOffer] Starting offer creation flow
[sendHydratedOffer] Offer created and sent successfully
[sendJobOfferLetter] DocuSeal submission created successfully
[sendJobOfferLetter] job_offers status updated to SENT
[sendJobOfferLetter] Notification verified
```

### Step 3: Verify in Database
```sql
-- Check if offer was created
SELECT id, application_id, status, docuseal_submission_id 
FROM job_offers 
WHERE application_id = 'YOUR_APP_ID'
ORDER BY created_at DESC LIMIT 1;

-- Check if notification was created (might take 1-2 seconds due to trigger)
SELECT id, recipient_id, type, title, body, created_at
FROM notifications
WHERE type = 'job_offer_sent'
ORDER BY created_at DESC LIMIT 1;

-- Check if recipient_id matches the candidate
SELECT id FROM profiles WHERE id = 'RECIPIENT_ID_FROM_NOTIFICATION';
```

### Step 4: Test Complete Flow
1. **Send an offer** from the Review Board
2. **Check server logs** for the logging messages listed in Step 2
3. **Query database** following Step 3 instructions
4. **Log in as candidate** and verify:
   - Notification appears on dashboard
   - Notification has correct title and body
   - Click leads to application detail
5. **Sign the document** in DocuSeal embed
6. **Check if HR receives** "Offer Accepted" notification

## Common Issues & Solutions

### Issue: "No job_offer_sent notification found. Database trigger may not have fired."

**Possible Causes:**
1. **Trigger not deployed** - The migration file wasn't run
   - Solution: Run `20260513_add_job_offer_notification_trigger.sql` in Supabase

2. **RLS policy preventing insert** - Trigger runs as SECURITY DEFINER but there might be other issues
   - Solution: Check if notifications RLS policy allows trigger inserts:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'notifications';
   ```

3. **Foreign key constraint** - The candidate_id doesn't exist in applications table
   - Solution: Verify application.candidate_id exists and references valid profile_id

### Issue: "DocuSeal submission created but status didn't update to SENT"

**Possible Causes:**
1. **Database permission issue** - Job offers table update failed
   - Solution: Check update error logs in console

2. **Wrong status value** - Status is still "DRAFT"
   - Solution: Verify status_enum value using:
   ```sql
   SELECT id, status FROM job_offers WHERE id = 'OFFER_ID';
   ```

### Issue: Candidate doesn't see notification

**Possible Causes:**
1. **Wrong recipient_id** - Notification created for wrong user
   - Solution: Verify notification.recipient_id matches candidate's profile.id

2. **RLS policy blocking query** - Candidate can't see their own notifications
   - Solution: Test with admin client to verify notifications exist

## Environment Variables Required

```env
DOCUSEAL_API_KEY=your_api_key_here
DOCUSEAL_BASE_URL=https://api.docuseal.com
```

## Files Changed

- `app/(auth)/actions/offer-actions.ts` - Fixed status enum, added logging
- `app/(dashboard)/jobs/manage/[id]/applicants/[appId]/offer/send-offer-actions.ts` - Added external_id, added logging
- `supabase/20260513_add_job_offer_notification_trigger.sql` - NEW: Database trigger

## Next Steps

1. **Deploy the migration** to your Supabase database
2. **Monitor logs** when testing the offer flow
3. **Verify notifications** are created in database
4. **Test with real candidate** to ensure end-to-end flow works
5. **Monitor DocuSeal webhook** to ensure status updates propagate correctly

## Related Documentation
- Database Schema: `supabase/20260511_dynamic_job_offers_schema.sql`
- Notification Types: `docs/JOB_OFFER_COMPLETE_SETUP.md`
- DocuSeal Integration: `lib/docuseal.ts`
