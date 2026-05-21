# Pipeline Progression Testing Guide

## Quick Start: Testing the Pipeline Flow

### Prerequisites
- Access to the HR dashboard at `/jobs/manage/[jobId]/applicants`
- At least one job posting with applicants in "New" stage
- Developer tools open to monitor console and network requests

---

## Test Scenario: Move One Applicant Through Complete Pipeline

### Step 1: Navigate to Applicants Hub
1. Go to Jobs → Manage [Job Title] → Applicants tab
2. Verify you see a Kanban board with 5 columns: New, Screening, Interview, Offer, Hired

### Step 2: Move to Screening
1. **Initial State:** Applicant in "New" column with status "submitted" or "draft"
2. **Action:** Click "Move to screening" button on applicant card
3. **Expected Result:**
   - Toast appears: `"✓ [Applicant Name] moved to Screening"`
   - Applicant card moves to "Screening" column
   - Applicant status changes to "under_review"
   - Real-time sync: Status visible immediately (no page refresh needed)
4. **Verify in DB:**
   ```sql
   SELECT id, status FROM applications WHERE id = '[APPLICATION_ID]';
   -- Should show: status = 'under_review'
   ```

### Step 3: Move to Interview (Requires Scheduling)
1. **Initial State:** Applicant in "Screening" column
2. **Action:** Click "Schedule interview" button
3. **Expected Result:**
   - Modal opens: "Schedule Interview"
   - Form fields visible: Date/Time, Duration, Interview Availability (online/in-person)
   - No interview record exists yet in database

4. **Fill Interview Form:**
   - Set Date/Time: 3 days from now, 10:00 AM
   - Select Duration: 60 minutes
   - Choose Availability: Online
   - Click Submit

5. **Expected Result After Submit:**
   - Modal closes
   - Toast: `"✓ [Applicant Name] interview scheduled"`
   - Applicant moves to "Interview" column
   - Applicant status changes to "interview_scheduled"
   - Real-time sync: Changes visible immediately

6. **Verify in DB:**
   ```sql
   SELECT id, status, scheduled_at FROM interviews WHERE application_id = '[APPLICATION_ID]';
   -- Should show: status = 'scheduled', scheduled_at = '2024-XX-XX 10:00:00'
   
   SELECT id, status FROM applications WHERE id = '[APPLICATION_ID]';
   -- Should show: status = 'interview_scheduled'
   ```

### Step 4: Move to Offer (Requires Creating & Sending Offer)
1. **Initial State:** Applicant in "Interview" column with status "interview_scheduled" or "interviewed"
2. **Action:** Click "Send offer" button
3. **Expected Result (if no offer exists):**
   - Toast: "Please create and send an offer to proceed"
   - Drawer opens with offer creation form (or navigates to offer page)
   
4. **In Offer Form:**
   - Fill in offer details (salary, start date, benefits, etc.)
   - Click "Send Offer" button
   
5. **Expected Result After Send:**
   - Toast: `"✓ Offer sent to [Applicant Name]"`
   - Application status updates to "offer_sent"
   - Applicant moves to "Offer" column
   - Real-time sync: Changes visible immediately

6. **Verify in DB:**
   ```sql
   SELECT id, status FROM job_offers WHERE application_id = '[APPLICATION_ID]';
   -- Should show: status = 'SENT'
   
   SELECT id, status FROM applications WHERE id = '[APPLICATION_ID]';
   -- Should show: status = 'offer_sent'
   ```

### Step 5: Move to Hired (Requires Signed Offer)
1. **Initial State:** Applicant in "Offer" column with offer "SENT" status
2. **Action:** Candidate signs offer via DocuSeal link
3. **Expected Result:**
   - DocuSeal webhook fires (check logs: `app/api/webhooks/docuseal`)
   - Offer status updates to "SIGNED" or "ACCEPTED"
   - Real-time sync: Applicant card shows "✓ Signed — confirm hire" badge
   - Hiring panel "Hired" column count increases

4. **HR Confirms Hire:**
   - Click "Confirm hire ✓" button on applicant card
   - HireConfirmBottomSheet opens showing:
     - Signed PDF preview (if available)
     - Salary amount
     - Start date
     - Work setup
   - Click "Confirm Hire" button

5. **Expected Result After Confirmation:**
   - Toast: `"✓ [Applicant Name] hired successfully"`
   - Applicant moves to "Hired" column
   - Application status changes to "hire_confirmed"
   - Offer status changes to "HIRED"
   - Applicant's profile role changes to "employee"
   - Notification created for candidate
   - Applicant's Kanban card shows "Hired ✓" (read-only, no more actions)

6. **Verify in DB:**
   ```sql
   SELECT id, status FROM job_offers WHERE application_id = '[APPLICATION_ID]';
   -- Should show: status = 'HIRED'
   
   SELECT id, status FROM applications WHERE id = '[APPLICATION_ID]';
   -- Should show: status = 'hire_confirmed'
   
   SELECT id, role FROM profiles WHERE id = '[CANDIDATE_ID]';
   -- Should show: role = 'employee'
   
   SELECT * FROM notifications WHERE recipient_id = '[CANDIDATE_ID]' ORDER BY created_at DESC LIMIT 1;
   -- Should show: notification about hire confirmation
   ```

---

## Error Scenarios to Test

### Scenario 1: Try to Skip Stages
1. **Action:** Take an applicant in "New" stage and try to directly move to "Interview"
2. **Expected Result:** 
   - Error message: `"Can only move to the next stage..."`
   - Applicant remains in "New" stage
   - No status change in database

### Scenario 2: Network Error During Transition
1. **Action:** Open DevTools, set network to "Throttling" or "Offline"
2. **Click:** "Move to screening" button on an applicant
3. **Expected Result:**
   - Error toast appears
   - Applicant status NOT changed in database
   - Applicant still in "New" column
   - Button remains clickable to retry

### Scenario 3: Interview Not Scheduled
1. **Action:** Click "Schedule interview" → Cancel modal without filling form
2. **Expected Result:**
   - Modal closes
   - Application remains in "Screening" stage
   - No interview record created
   - Button still shows "Schedule interview"

### Scenario 4: Offer Not Signed Yet
1. **Action:** Move applicant to "Offer" stage and send offer
2. **Action:** Click "Confirm hire ✓" WITHOUT candidate signing
3. **Expected Result:**
   - HireConfirmBottomSheet opens
   - But offer status is still "SENT" (not signed)
   - "Confirm Hire" button shows warning: "Offer must be signed first"
   - Click is prevented or shows error

---

## Real-Time Sync Verification

### Test 1: Multi-Tab Sync
1. **Setup:** Open applicants page in two browser tabs/windows
2. **Action:** In Tab 1, click "Move to screening" on an applicant
3. **Expected Result:** 
   - Tab 1: Applicant moves to Screening column immediately
   - Tab 2: Without refresh, applicant also moves to Screening column
   - Both tabs show same state

### Test 2: Concurrent Updates
1. **Setup:** Have HR1 and HR2 both on applicants page
2. **Action:** 
   - HR1 clicks "Move to screening"
   - HR2 simultaneously clicks same applicant button
3. **Expected Result:**
   - First action succeeds with toast
   - Second action fails (already in target stage) or succeeds idempotently
   - No data corruption or duplicate records
   - Both UIs converge to same state

### Test 3: Realtime Connection Status
1. **Action:** Look at applicants page header
2. **Expected Result:** Small badge shows "🟢 Realtime Connected" or similar
3. **Simulate Offline:**
   - DevTools → Offline
   - Badge changes to "🔴 Disconnected" or similar
   - Manual refresh still works
   - Realtime reconnects when online

---

## Console Logs to Monitor

### Development Mode
Open browser console and look for logs like:

```javascript
// Successful transitions
[Pipeline] Moving John Doe to screening...
[Pipeline] Successfully moved to screening

// Realtime sync
[Realtime] Successfully subscribed to applicants channel
[Realtime] Received update: applications -> under_review

// Errors
[Pipeline] Validation failed: Cannot skip stages
[Realtime] Channel error - updates may not sync
```

### Check Network Requests
1. DevTools → Network tab
2. Filter by XHR/Fetch
3. When clicking "Move to screening", should see:
   - POST to `/app/.../applicants/pipeline-actions.ts`
   - OR POST to `/api/applications/[id]/status`
   - Response: `{ success: true, newStatus: "under_review", ... }`

---

## Database Verification Script

Run these queries to verify pipeline state:

```sql
-- View full pipeline state for a job
SELECT 
  a.id as app_id,
  p.first_name, p.last_name,
  a.status as app_status,
  i.status as interview_status,
  jo.status as offer_status
FROM applications a
LEFT JOIN profiles p ON a.candidate_id = p.id
LEFT JOIN interviews i ON a.id = i.application_id
LEFT JOIN job_offers jo ON a.id = jo.application_id
WHERE a.job_posting_id = '[JOB_ID]'
ORDER BY a.created_at;

-- Count applicants by stage
SELECT 
  CASE 
    WHEN a.status IN ('submitted', 'draft') THEN 'New'
    WHEN a.status IN ('under_review', 'shortlisted') THEN 'Screening'
    WHEN a.status IN ('interview_scheduled', 'interviewed') THEN 'Interview'
    WHEN a.status IN ('negotiating', 'offer_sent') THEN 'Offer'
    WHEN a.status IN ('hired', 'hire_confirmed') THEN 'Hired'
  END as stage,
  COUNT(*) as count
FROM applications
WHERE job_posting_id = '[JOB_ID]'
GROUP BY stage
ORDER BY stage;

-- Check for any data inconsistencies
SELECT a.id, a.status, jo.status as offer_status
FROM applications a
LEFT JOIN job_offers jo ON a.id = jo.application_id
WHERE a.status = 'hired' AND jo.status != 'HIRED'
  OR a.status = 'hire_confirmed' AND jo.status != 'HIRED'
  OR a.status IN ('interviewed', 'interview_scheduled') AND jo.status = 'SENT' AND jo.is_active = false;
```

---

## Success Criteria

✅ **All tests pass if:**
- Applicants move through pipeline in strict linear order
- Modal requirements (interview, offer) prevent unauthorized advancement
- Real-time sync updates all views instantly
- Error states don't advance applicants
- Database state matches UI state
- Roles update correctly when hired
- Notifications are created on hire confirmation
