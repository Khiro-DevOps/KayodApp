# Implementation Checklist & Verification Guide

## ✅ Pre-Deployment Verification

Use this checklist to ensure everything is working before deploying to production.

### 1. Database Migrations ✨

- [ ] **Migration #1**: Run this in Supabase SQL Editor
  ```sql
  ALTER TABLE interviews ADD COLUMN IF NOT EXISTS candidate_interview_type_preference interview_type;
  ALTER TABLE interviews ADD COLUMN IF NOT EXISTS preference_submitted_at timestamptz;
  ALTER TABLE interviews ADD COLUMN IF NOT EXISTS preference_status varchar(50) DEFAULT 'pending';
  ```

- [ ] **Migration #2**: Run this in Supabase SQL Editor
  ```sql
  CREATE TABLE IF NOT EXISTS interview_proposals (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    interview_type interview_type NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(interview_id, interview_type)
  );
  
  CREATE INDEX IF NOT EXISTS idx_interview_proposals_interview_id ON interview_proposals(interview_id);
  CREATE INDEX IF NOT EXISTS idx_interviews_candidate_preference ON interviews(application_id, preference_status);
  ```

- [ ] **Verify migrations succeeded**
  - Columns appear in interviews table
  - interview_proposals table exists
  - Indices created successfully

---

### 2. File Structure ✅

Verify these files exist and are in correct locations:

**New Server Components**:
- [ ] `app/(dashboard)/jobs/manage/[id]/applicants/page.tsx` - Updated to use client component

**New Client Components**:
- [ ] `app/(dashboard)/jobs/manage/[id]/applicants/applicants-list-client.tsx` - Card list with drawer
- [ ] `app/(dashboard)/jobs/manage/[id]/applicants/applicant-detail-drawer.tsx` - Side drawer
- [ ] `app/(dashboard)/jobs/manage/[id]/applicants/interview-scheduling-form.tsx` - Interview form

**New Server Actions**:
- [ ] `app/(dashboard)/jobs/manage/[id]/applicants/actions.ts` - scheduleInterviewProposal & submitInterviewPreference

**Documentation**:
- [ ] `docs/INTERVIEW_SCHEDULING_QUICK_START.md` - User guide
- [ ] `docs/INTERVIEW_SCHEDULING_IMPLEMENTATION.md` - Feature details
- [ ] `docs/INTERVIEW_SCHEDULING_API_REFERENCE.md` - API & database specs
- [ ] `docs/INTERVIEW_SCHEDULING_ARCHITECTURE.md` - Architecture overview

**Database Migrations**:
- [ ] `supabase/20260420_add_interview_preferences.sql` - Preference columns
- [ ] `supabase/20260420_create_interview_proposals.sql` - Proposals table

---

### 3. Imports & Dependencies ✅

Check imports in the main files:

**applicants-list-client.tsx**:
```typescript
import { useState } from "react";
import type { Application, Interview } from "@/lib/types";
import ApplicantDetailDrawer from "./applicant-detail-drawer";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
```
- [ ] All imports resolve correctly
- [ ] No red squiggles in VS Code

**applicant-detail-drawer.tsx**:
```typescript
import { useState } from "react";
import type { Application } from "@/lib/types";
import InterviewSchedulingForm from "./interview-scheduling-form";
```
- [ ] All imports resolve correctly

**interview-scheduling-form.tsx**:
```typescript
import { useState } from "react";
import { scheduleInterviewProposal } from "./actions";
```
- [ ] "use client" directive present
- [ ] scheduleInterviewProposal function imported

**actions.ts**:
```typescript
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
```
- [ ] Supabase server client available
- [ ] revalidatePath imported OK

---

### 4. TypeScript Compilation ✅

Run type check:
```bash
npm run type-check
# or
tsc --noEmit
```

- [ ] No TypeScript errors
- [ ] No undefined type references
- [ ] All Application/Interview types resolved

---

### 5. Functionality Tests 🧪

#### Test 1: View Applicants Page
```
1. Navigate to /jobs/manage/[any-job-id]/applicants
2. Verify applicant cards render
3. Check cards show:
   ✓ Candidate name
   ✓ Email
   ✓ Match score badge
   ✓ Status badge
   ✓ Applied date
   ✓ Resume title (if has resume)
   ✓ Cover letter preview (if has cover letter)
```

- [ ] **PASSED** - All cards display correctly

#### Test 2: Open Drawer
```
1. Click any applicant card
2. Verify drawer slides in from right
3. Verify overlay appears
4. Check drawer shows:
   ✓ Candidate name in header
   ✓ Close button in header
   ✓ Contact information (email, phone, location)
   ✓ Match score with progress bar
   ✓ Resume download link
   ✓ Application status
   ✓ Cover letter (if exists)
```

- [ ] **PASSED** - Drawer opens smoothly with all details

#### Test 3: Close Drawer
```
1. Click X button in drawer header
   OR
2. Click the semi-transparent overlay
3. Verify drawer slides out
4. Verify list is visible again
```

- [ ] **PASSED** - Drawer closes from either action

#### Test 4: Open Interview Form
```
1. Open drawer (Test 2)
2. Click "Schedule Interview" button
3. Verify form appears in drawer footer with:
   ✓ Date/Time input (pre-filled with 3 days from now)
   ✓ Timezone dropdown (defaults to Asia/Manila)
   ✓ Interview type checkboxes (Online & In-Person)
   ✓ Notes textarea
   ✓ Send Proposal button
   ✓ Cancel button
```

- [ ] **PASSED** - Form displays correctly

#### Test 5: Form Validation
```
1. Open interview form (Test 4)
2. Uncheck all interview type checkboxes
3. Try to click "Send Proposal"
4. Verify error message shows: "Select at least one interview type"
5. Check both checkboxes
6. Error should disappear
```

- [ ] **PASSED** - Validation works correctly

#### Test 6: Submit Interview Proposal
```
1. Open interview form with valid data
2. Ensure at least one interview type is selected
3. Click "Send Proposal" button
4. Verify button shows "Scheduling..." text
5. Wait 1-2 seconds
6. Verify success behavior:
   ✓ Form hides
   ✓ Drawer closes
   ✓ Card shows interview date/time
   ✓ Success toast/message appears (if implemented)
```

- [ ] **PASSED** - Form submits successfully

#### Test 7: Database Updates
```
After Test 6, verify in Supabase:
1. Go to interviews table
2. Find latest entry for the application
3. Verify fields are set:
   ✓ scheduled_at (your chosen date/time)
   ✓ timezone (your chosen timezone)
   ✓ preference_status = 'pending'
4. Go to interview_proposals table
5. Verify entries exist for each type selected
6. Check applications table
7. Verify status = 'interview_scheduled'
8. Check notifications table
9. Verify notification created for candidate
```

- [ ] **PASSED** - Database records created correctly

#### Test 8: Candidate Notification
```
1. Check candidate's email/in-app notifications
2. Verify they received notification:
   ✓ Title: "Interview Invitation 🎉" or similar
   ✓ Body mentions the job title
   ✓ Contains link to /interviews/respond/[appId]
```

- [ ] **PASSED** - Candidate notified

#### Test 9: Candidate Response (If implemented)
```
1. As candidate, navigate to /interviews/respond/[appId]
2. Verify page shows:
   ✓ Interview date/time
   ✓ Proposed interview types (checkboxes or radio buttons)
   ✓ HR's notes
3. Select one interview type
4. Click submit
5. Verify preference saved:
   ✓ candidate_interview_type_preference updated
   ✓ preference_submitted_at set
   ✓ preference_status = 'submitted'
```

- [ ] **PASSED** - Candidate can respond

#### Test 10: HR Notification About Preference
```
1. After candidate responds (Test 9)
2. HR should receive notification:
   ✓ Title mentions preference submitted
   ✓ Shows candidate name
   ✓ Contains link back to applicants page
```

- [ ] **PASSED** - HR notified of response

#### Test 11: Card Displays Preference
```
1. Return to applicants list as HR
2. Find the card where you scheduled interview
3. Verify card shows:
   ✓ Interview date/time
   ✓ Candidate's selected format (📹 Online or 🏢 In-Person)
   ✓ Icons and formatting looks right
```

- [ ] **PASSED** - Card shows preference

#### Test 12: Responsive Design
```
1. Open applicants page on desktop (width > 1024px)
   ✓ Cards span full width
   ✓ Drawer is readable width (max-w-md)
   ✓ Form fields are usable
   
2. Open on tablet (width 768px)
   ✓ Cards still readable
   ✓ Drawer still functional
   
3. Open on mobile (width 375px)
   ✓ Cards stack properly
   ✓ Drawer takes up full width except margin
   ✓ Form inputs not too cramped
```

- [ ] **PASSED** - Responsive on all screen sizes

#### Test 13: Error Handling
```
1. Fill interview form
2. Unplug internet (simulate offline)
3. Click "Send Proposal"
4. Verify error message appears
5. Reconnect internet
6. Try again - should work
```

- [ ] **PASSED** - Errors handled gracefully

#### Test 14: Multiple Applicants
```
1. On applicants page with 3+ applicants
2. Schedule interview for applicant #1
3. Click on applicant #2
4. Verify correct data shows (not #1's data)
5. Schedule for applicant #2
6. Verify both have interviews scheduled
7. Check cards show different preferences
```

- [ ] **PASSED** - Data correctly isolated per applicant

---

### 6. Performance Tests ⚡

#### Test: Load Time
```
1. Open Chrome DevTools (F12)
2. Go to Network tab
3. Reload applicants page
4. Verify load time < 3 seconds
5. Check no failed requests (red items)
```

- [ ] **PASSED** - Page loads quickly

#### Test: Form Submission Time
```
1. Open DevTools Network tab
2. Click "Send Proposal"
3. Verify request completes < 2 seconds
4. Check response status 200 OK
```

- [ ] **PASSED** - Submission is fast

---

### 7. Browser Compatibility ✅

Test in:

- [ ] **Chrome** (latest) - ✅ PASSED
- [ ] **Firefox** (latest) - ✅ PASSED
- [ ] **Safari** (latest) - ✅ PASSED
- [ ] **Edge** (latest) - ✅ PASSED

---

### 8. Accessibility ♿

- [ ] **Keyboard Navigation**: Can tab through all form fields
- [ ] **Form Labels**: All inputs have `<label>` tags
- [ ] **Color Contrast**: Status badges readable (use WCAG checker)
- [ ] **Mobile Keyboard**: Form doesn't hide behind mobile keyboard
- [ ] **Screen Reader**: Test with VoiceOver/NVDA

---

### 9. Security ✔️

- [ ] **Authentication**: HR-only routes check user role
- [ ] **CSRF Protection**: Server actions handle CSRF tokens
- [ ] **Input Validation**: Date/time format validated
- [ ] **Interview Type Validation**: Only 'online' or 'in_person' accepted
- [ ] **SQL Injection**: Using Supabase parameterized queries

---

### 10. Documentation ✅

- [ ] **Code comments**: Complex logic has comments
- [ ] **TypeScript types**: All props typed
- [ ] **README updated**: List new routes and features
- [ ] **API documented**: Server actions documented
- [ ] **Database documented**: Schema changes documented

---

## 📋 Deployment Checklist

Before pushing to production:

```
□ All tests PASSED
□ Database migrations run
□ Type checking passes (tsc --noEmit)
□ No console errors
□ Environment variables set:
  □ NEXT_PUBLIC_SUPABASE_URL
  □ NEXT_PUBLIC_SUPABASE_ANON_KEY
  □ (Any other required vars)
□ Notifications configured in Supabase
□ Daily.co credentials (if using online interviews)
□ Email service configured (for candidate notifications)
□ Backup database (just in case)
□ Test in staging environment first
□ Monitor error logs after deployment
□ Notify users about new feature
```

---

## 🆘 Troubleshooting Guide

### Drawer doesn't open on card click
**Possible causes**:
1. State not updating
2. Component not rendering
3. z-index conflict

**Solutions**:
```bash
# Check browser console for errors
F12 → Console tab

# Verify ApplicantDetailDrawer component exists
ls app/\(dashboard\)/jobs/manage/\[id\]/applicants/applicant-detail-drawer.tsx

# Check z-index values in CSS
grep "z-" applicant-detail-drawer.tsx
```

### Form doesn't submit
**Possible causes**:
1. Server action not imported
2. No interview type selected
3. Database permissions issue

**Solutions**:
```typescript
// Check action is imported
import { scheduleInterviewProposal } from "./actions";

// Verify database table has permissions
SELECT * FROM interview_proposals LIMIT 1;  // Run in Supabase

// Check browser network tab for failed requests
F12 → Network tab → Look for failed POST
```

### Candidate doesn't receive notification
**Possible causes**:
1. Notification insert failed silently
2. Email service not configured
3. Wrong recipient_id

**Solutions**:
```sql
-- Check if notification was created
SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5;

-- Verify candidate_id is correct
SELECT id, candidate_id FROM applications WHERE id = '[app-id]';
```

### Interview data not saving
**Possible causes**:
1. Migration not run
2. Column doesn't exist
3. Database trigger blocking insert

**Solutions**:
```sql
-- Verify columns exist
\d interviews;  -- List all columns

-- Check for constraints blocking insert
SELECT * FROM pg_stat_user_tables WHERE relname = 'interviews';
```

---

## ✨ Success Criteria

You're done when:

✅ All 14 functionality tests PASSED  
✅ Database has data for 2+ interviews  
✅ Card shows interview details correctly  
✅ Candidate can respond to interview  
✅ No TypeScript errors  
✅ No console errors  
✅ Loads in < 3 seconds  
✅ Works on mobile/tablet/desktop  
✅ Notifications send correctly  
✅ All security checks passed  

---

## 📞 Support Resources

If something fails:

1. **Check the docs**: 
   - INTERVIEW_SCHEDULING_QUICK_START.md
   - INTERVIEW_SCHEDULING_API_REFERENCE.md

2. **Check TypeScript errors**: Run `npm run type-check`

3. **Check database**: Verify migrations ran in Supabase

4. **Check logs**: Look at deployment/server logs

5. **Check browser console**: F12 → Console tab

6. **Review the code**: Check file imports and function names

---

## 🎉 Next Steps After Verification

1. **Update README** with new feature description
2. **Announce to team** that applicant scheduling is live
3. **Gather feedback** from HR team
4. **Monitor** error logs for issues
5. **Plan enhancements** (video room creation, reminders, etc.)

---

Thank you for using this implementation! 🚀
