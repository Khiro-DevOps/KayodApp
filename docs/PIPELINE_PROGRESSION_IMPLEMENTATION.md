# Application Pipeline Progression Implementation

## Overview

This document describes the complete implementation of the linear application pipeline progression system: **New → Screening → Interview → Offer → Hired**.

The system enforces strict linear progression where applicants must follow the sequence without skipping stages. Manual triggers from HR move applicants forward in the pipeline, with integrations to existing features for interviews, offers, and hiring.

---

## Architecture & Components

### 1. **Pipeline Definition** (`lib/pipeline.ts`)

Defines the linear pipeline stages:

```typescript
PIPELINE_STAGES = [
  { key: "new", label: "New", statuses: ["submitted", "draft"], position: 0 },
  { key: "screening", label: "Screening", statuses: ["under_review", "shortlisted"], position: 1 },
  { key: "interview", label: "Interview", statuses: ["interview_scheduled", "interviewed"], position: 2 },
  { key: "offer", label: "Offer", statuses: ["negotiating", "offer_sent"], position: 3 },
  { key: "hired", label: "Hired", statuses: ["hired", "hire_confirmed"], position: 4 },
];
```

**Key Functions:**
- `getCurrentStage(status)` - Get the current stage for an applicant
- `getNextStage(status)` - Get the next stage in the pipeline
- `validateStageProgression(currentStatus, targetStageKey)` - Validate that progression is allowed
- `getTransitionRequirements(targetStageKey)` - Get what's required before moving to a stage

### 2. **Pipeline Actions** (`app/(dashboard)/jobs/manage/[id]/applicants/pipeline-actions.ts`)

Server actions that handle state transitions:

#### `moveToScreening(applicationId)`
- **From:** New stage (submitted, draft)
- **To:** Screening stage (under_review)
- **Action:** Simple status update
- **Returns:** Success/error with applicant name

#### `moveToInterview(applicationId)`
- **From:** Screening stage (under_review, shortlisted)
- **To:** Interview stage (interview_scheduled)
- **Requirements:** Interview must be scheduled first
- **Flow:**
  1. Check if interview exists
  2. If not, return `{ requiresModal: true, nextAction: "schedule_interview" }`
  3. If exists, update application status to `interview_scheduled`
- **Called After:** `confirmInterviewScheduled()` once interview is created

#### `confirmInterviewScheduled(applicationId)`
- **Purpose:** Update application status after interview is successfully scheduled
- **Called from:** `applicant-detail-drawer.tsx` in the InterviewSchedulingForm's onSuccess callback
- **Sets:** Application status to `interview_scheduled`

#### `moveToOffer(applicationId)`
- **From:** Interview stage (interview_scheduled, interviewed)
- **To:** Offer stage (offer_sent)
- **Requirements:** Offer must be created and sent first
- **Flow:**
  1. Check if offer exists
  2. If not, return `{ requiresModal: true, nextAction: "send_offer" }`
  3. If exists and status is SENT/REVISED, update application status to `offer_sent`
- **Called After:** Offer is sent via drawer

#### `confirmOfferSent(applicationId)`
- **Purpose:** Update application status after offer is successfully sent
- **Sets:** Application status to `offer_sent`

#### `moveToHired(applicationId)`
- **From:** Offer stage (negotiating, offer_sent)
- **To:** Hired stage (hired, hire_confirmed)
- **Requirements:** Offer must be signed
- **Flow:**
  1. Check if offer is signed (status: ACCEPTED, SIGNED, HIRED)
  2. If not, return `{ requiresModal: true, nextAction: "confirm_hire" }`
  3. If yes, return flag to open hire confirmation sheet

---

## UI Integration

### **Applicants Hub** (`applicants-list-client.tsx`)

The main Kanban-style interface showing applicants in each pipeline stage.

#### Quick Action Handler (`handleQuickAction`)

When an applicant card's button is clicked:

1. **Screen Action:**
   ```
   Button: "Move to screening" 
   → moveToScreening() 
   → Update UI with toast
   ```

2. **Interview Action:**
   ```
   Button: "Schedule interview" 
   → moveToInterview()
   - If interview not scheduled: Open drawer with interview form
   - If scheduled: Update status to interview_scheduled
   ```

3. **View Interview Action:**
   ```
   Button: "View interview" (after scheduled)
   → Open drawer showing interview details
   ```

4. **Send Offer Action:**
   ```
   Button: "Send offer" 
   → moveToOffer()
   - If offer not sent: Open drawer with offer form
   - If sent: Update status to offer_sent
   ```

5. **View Offer Action:**
   ```
   Button: "View offer" (after sent)
   → Open drawer showing offer details
   ```

6. **Confirm Hire Action:**
   ```
   Button: "Confirm hire ✓" 
   → moveToHired()
   - If offer signed: Open HireConfirmBottomSheet
   - Shows signed PDF and metadata
   - On confirm: Calls /api/hr/confirm-hire/{applicationId}
   ```

#### Stage Counts
Each column header shows the count of applicants in that stage, auto-updating with real-time sync.

#### Real-Time Sync
The component subscribes to Supabase changes on:
- `applications` table → Updates app status
- `interviews` table → Updates interview state
- `job_offers` table → Updates offer state
- `signed_documents` table → Tracks signing status

All changes automatically trigger UI re-render, keeping the pipeline view current.

---

### **Applicant Detail Drawer** (`applicant-detail-drawer.tsx`)

Shown when clicking an applicant card. Contains:

#### Interview Scheduling Form
- **Trigger:** "Schedule interview" button
- **Modal:** Opens "Schedule Interview" modal
- **Form Fields:**
  - Date & Time (datetime-local input)
  - Duration (30/45/60/90/120 minutes)
  - Interview Availability (online/in-person)
  - Location details (for in-person)
- **On Success:**
  ```typescript
  1. Form calls scheduleInterviewProposal()
  2. Creates interview record with status="scheduled"
  3. onSuccess callback:
     - Calls confirmInterviewScheduled()
     - Updates application status to interview_scheduled
     - Closes drawer and refreshes page
  ```

#### Resume Preview
- Shows applicant's resume in embedded iframe
- Generates signed URL for secure access

#### Contact Information
- Email, Phone, Location
- Match Score

#### Application Status
- Displays current pipeline status

---

## State Transitions & Error Handling

### Linear Enforcement
Each action validates that the applicant is in the correct stage:

```typescript
if (!["submitted", "draft"].includes(app.status)) {
  return {
    success: false,
    error: "Applicant must be in New stage"
  };
}
```

If validation fails, the applicant **does not advance** and an error is shown.

### Modal-Required Transitions
When moving to Interview or Offer requires user input:

```typescript
return {
  success: false,
  error: "Interview scheduling required",
  requiresModal: true,
  nextAction: "schedule_interview"
};
```

The UI recognizes this pattern and opens the appropriate form/modal.

### Error Recovery
If an API call fails during a transition:
- Toast error is displayed
- Applicant status **remains unchanged**
- No fallback or revert to previous stage
- User can retry by clicking the button again

Example:
```typescript
try {
  const result = await moveToScreening(app.id);
  if (!result.success) {
    toast.error(result.error);
    return; // Stop - don't advance
  }
} catch (error) {
  toast.error("An unexpected error occurred");
  return; // Stop - don't advance
}
```

---

## Data Refresh Strategy

### Server-Side Revalidation
After each successful transition, the server revalidates cache paths:

```typescript
revalidatePath("/jobs/manage");
revalidatePath("/applications");
```

This ensures page data is fresh on next request.

### Real-Time Sync (Supabase)
- Changes to `applications`, `interviews`, `job_offers`, `signed_documents` trigger Supabase postgres_changes events
- These automatically update the client state and re-render
- Ensures HR view and applicant-facing portal stay in sync

### Toast Feedback
- Success: `"✓ John Doe moved to Screening"`
- Error: `"Failed to move to screening: [reason]"`
- Info: `"Please schedule an interview to proceed"`

---

## Integration with Existing Features

### 1. Interview Scheduling
- **Function:** `scheduleInterviewProposal()` in `app/.../applicants/actions.ts`
- **Creates:** Interview record with:
  - `status: "scheduled"`
  - `scheduled_at`, `duration_minutes`
  - `interview_type: "online" | "in_person"`
  - `timezone`, `location_address` (if in-person)
  - `video_room_url` (if online, generates Jitsi room)
- **Called via:** InterviewSchedulingForm in the drawer
- **After Success:** `confirmInterviewScheduled()` updates application status

### 2. Offer Sending
- **Function:** `sendOffer()` in `lib/offers.ts`
- **Transitions:** Offer status from DRAFT/REVISED → SENT
- **Side Effects:**
  - Generates DocuSeal submission for signing
  - Sends email to candidate with signing link
- **Called via:** Offer management UI (typically in a separate page/drawer)
- **After Success:** `confirmOfferSent()` updates application status

### 3. Hire Confirmation
- **Endpoint:** `POST /api/hr/confirm-hire/{applicationId}`
- **Checks:**
  1. Verifies offer is signed (DocuSeal completion)
  2. If not confirmed yet, performs live DocuSeal API check
- **On Success (atomic transaction):**
  - `job_offers` → `status = HIRED`
  - `applications` → `status = hire_confirmed`
  - `profiles` → `role = employee`
  - Creates notification for candidate
- **Called via:** HireConfirmBottomSheet component
- **Side Effect:** Applicant is now an employee in the system

---

## Complete Flow Example

### Scenario: Moving an applicant from New to Hired

1. **HR clicks "Move to screening"** on New applicant card
   - `handleQuickAction("screen")` → `moveToScreening()`
   - Application: submitted → under_review
   - Toast: "✓ John Doe moved to Screening"
   - UI updates via real-time sync

2. **HR clicks "Schedule interview"** on Screening applicant card
   - `handleQuickAction("interview")` → `moveToInterview()`
   - No interview found → returns `requiresModal: true`
   - Opens drawer with interview form
   - HR enters: date, time, duration, mode (online/in-person)
   - HR submits form

3. **Interview form submission**
   - `scheduleInterviewProposal()` creates interview record
   - Modal closes, `onSuccess` callback fires
   - Calls `confirmInterviewScheduled()`
   - Application: under_review → interview_scheduled
   - Drawer closes, page refreshes

4. **HR clicks "Send offer"** on Interview applicant card
   - `handleQuickAction("send_offer")` → `moveToOffer()`
   - No offer found → returns `requiresModal: true`
   - Opens drawer with offer creation form
   - HR enters offer details (salary, start date, benefits, etc.)
   - HR submits and sends offer

5. **Offer is sent**
   - `sendOffer()` creates DocuSeal submission
   - Candidate receives signing link
   - Application: interview_scheduled → offer_sent
   - Real-time sync updates Kanban board

6. **Candidate signs offer**
   - Candidate clicks link in email
   - Signs via DocuSeal embedded interface
   - DocuSeal webhook fires → updates offer.status = "SIGNED"
   - Candidate portal shows offer as signed

7. **HR clicks "Confirm hire ✓"** on Hired stage applicant card
   - `handleQuickAction("confirm_hire")` → `moveToHired()`
   - Offer is signed → returns `requiresModal: true, nextAction: "confirm_hire"`
   - Opens HireConfirmBottomSheet
   - Shows: signed PDF, salary, start date, work setup
   - HR clicks "Confirm Hire"

8. **Hire confirmation API call**
   - `POST /api/hr/confirm-hire/{applicationId}`
   - Atomic transaction:
     - offer.status = "HIRED"
     - application.status = "hire_confirmed"
     - profile.role = "employee"
     - Notification created for candidate
   - Toast: "✓ John Doe hired successfully"
   - UI updates: applicant moved to "Hired" column with ✓ badge

---

## Key Constraints

1. **Linear Only:** Cannot skip stages. Must go: New → Screening → Interview → Offer → Hired
2. **No Backward:** Cannot move an applicant to a previous stage
3. **Status Lock:** If a transition fails, applicant stays on current status
4. **Real-Time Sync:** Both HR and applicant portals must reflect changes instantly
5. **Atomic Operations:** Hiring transitions update multiple tables atomically to prevent data inconsistency

---

## Error Scenarios & Handling

| Scenario | Behavior |
|----------|----------|
| Interview not scheduled yet | Modal opens to schedule it; application doesn't advance |
| Offer not sent yet | Modal opens to send it; application doesn't advance |
| Offer not signed yet | Hire confirmation sheet opens; application stays in offer_sent |
| DocuSeal API fails | Toast error; hire confirmation fails; application unchanged |
| Network timeout | Toast error; UI state rollback; retry button available |
| Permission denied | "Unauthorized" error; action blocked at API level |
| Applicant already in target stage | Idempotent - silently succeeds (no change needed) |

---

## Files Summary

| File | Purpose |
|------|---------|
| `lib/pipeline.ts` | Pipeline definitions and validation logic |
| `app/.../applicants/pipeline-actions.ts` | Server actions for state transitions |
| `app/.../applicants/applicants-list-client.tsx` | Main UI with Kanban board and quick actions |
| `app/.../applicants/applicant-detail-drawer.tsx` | Drawer with interview scheduling form |
| `app/.../applicants/interview-scheduling-form.tsx` | Interview form (existing) |
| `lib/offers.ts` | Offer creation/sending functions (existing) |
| `app/api/hr/confirm-hire/[applicationId]/route.ts` | Hire confirmation endpoint (existing) |
| `components/hr/HireConfirmBottomSheet.tsx` | Hire confirmation UI (existing) |

---

## Future Enhancements

- [ ] Bulk actions (move multiple applicants at once)
- [ ] Undo/rollback capability with audit trail
- [ ] Conditional requirements (e.g., scoring threshold before offer)
- [ ] Automated stage transitions (e.g., auto-move after 7 days in stage)
- [ ] Stage completion notifications
- [ ] Applicant stage history timeline
