# Applicant Card Interactivity & Interview Scheduling Implementation

## Overview
This implementation enables HR managers to view interactive applicant cards and propose interview schedules with candidate choice of interview format (Online or In-Person).

## Features Implemented

### 1. Interactive Applicant Cards ✅
**Location**: `/jobs/manage/[id]/applicants`

**Features**:
- Cards are now fully clickable (hover effects indicate interactivity)
- Clicking opens a side drawer with full applicant details
- Shows candidate contact info, location, match score
- Displays resume with download link
- Shows interview details if already scheduled
- Click hint at the bottom guides users

**Component**: `applicants-list-client.tsx` (Client Component)
- Manages drawer state
- Renders applicant cards with hover effects
- Opens detail drawer on click

### 2. Applicant Detail Drawer 📋
**Location**: `applicant-detail-drawer.tsx`

**Displays**:
- Candidate profile information (name, email, phone, location)
- Match score with visual progress bar
- Resume download link
- Application status
- Cover letter
- Action buttons (Schedule Interview, Close)

**Transitions to Interview Scheduling** when "Schedule Interview" is clicked

### 3. Interview Scheduling Workflow 📅

#### Workflow Steps:
1. **HR Proposes Interview**
   - Clicks "Schedule Interview" button in drawer
   - Form appears in drawer footer
   - HR enters: date/time, timezone, optional notes
   - HR selects interview type options (Online, In-Person, or both)
   - HR clicks "Send Proposal to Candidate"

2. **Server Action: `scheduleInterviewProposal`**
   - Creates/updates interview record
   - Stores proposed interview types in `interview_proposals` table
   - Updates application status to `interview_scheduled`
   - Sends notification to candidate
   - Returns success/error response

3. **Candidate Responds**
   - Receives notification with link to `/interviews/respond/[applicationId]`
   - Views the proposed interview details
   - Selects their preferred format (Online or In-Person)
   - Submits preference

4. **Server Action: `submitInterviewPreference`**
   - Updates interview record with candidate's choice
   - Sets `candidate_interview_type_preference` field
   - Updates `preference_status` to "submitted"
   - Sends notification back to HR

### 4. Interview Format Options 🎯

HR can propose:
- **Online (Video Call)** 📹 - Virtual meeting via Daily.co
- **In-Person (Office)** 🏢 - Face-to-face at office location

Candidate chooses one from the proposed options.

## Database Schema Changes

### New Tables

#### `interview_proposals`
```sql
CREATE TABLE interview_proposals (
  id uuid PRIMARY KEY,
  interview_id uuid REFERENCES interviews(id),
  interview_type interview_type ('online' | 'in_person'),
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE(interview_id, interview_type)
);
```

### Modified Tables

#### `interviews` (Add 3 columns)
```sql
ALTER TABLE interviews ADD COLUMN candidate_interview_type_preference interview_type;
ALTER TABLE interviews ADD COLUMN preference_submitted_at timestamptz;
ALTER TABLE interviews ADD COLUMN preference_status varchar(50) DEFAULT 'pending';
```

**New Fields**:
- `candidate_interview_type_preference`: User's selected preference (online or in_person)
- `preference_submitted_at`: Timestamp when candidate submits preference
- `preference_status`: Track state (pending → submitted → confirmed)

## File Structure

```
app/(dashboard)/jobs/manage/[id]/applicants/
├── page.tsx                          # Server component - fetches data
├── applicants-list-client.tsx        # Client component - interactive cards
├── applicant-detail-drawer.tsx       # Side drawer with details
├── interview-scheduling-form.tsx     # Interview scheduling form
├── actions.ts                        # Server actions
└── [appId]/
    └── interview/
        └── page.tsx                  # Existing interview edit page
```

## Component Architecture

### Page Hierarchy
```
ApplicantsPage (Server)
└── ApplicantsListClient (Client)
    └── ApplicantDetailDrawer (Client)
        └── InterviewSchedulingForm (Client)
```

### State Management
- **DrawerOpen**: Managed by `ApplicantsListClient`
- **SelectedApplication**: Passed to drawer
- **SchedulingForm**: Shown/hidden within drawer footer

## Server Actions

### `scheduleInterviewProposal(formData: FormData)`
**Purpose**: HR proposes an interview with options

**Inputs**:
- `application_id`: Target application
- `job_id`: Context job ID
- `scheduled_at`: Proposed date/time
- `timezone`: Timezone for the interview
- `interview_types`: JSON array of proposed types ["online", "in_person"]
- `notes`: Optional additional notes

**Returns**:
```typescript
{
  success: boolean;
  interviewId?: string;
  error?: string;
}
```

**Side Effects**:
- Creates/updates interview record
- Creates interview proposal options
- Sends notification to candidate
- Updates application status
- Revalidates cache

---

### `submitInterviewPreference(formData: FormData)`
**Purpose**: Candidate submits their interview format preference

**Inputs**:
- `application_id`: Target application
- `preferred_type`: "online" or "in_person"

**Returns**:
```typescript
{
  success: boolean;
  error?: string;
}
```

**Side Effects**:
- Updates interview preference
- Sets preference_status to "submitted"
- Sends notification to HR
- Revalidates cache

## UI/UX Details

### Applicant Cards
- **Hover Effect**: Border color changes, shadow appears, avatar background darkens
- **Visual Indicators**: Match score badge, status badge, interview dates (if scheduled)
- **Click Hint**: "Click to view details..." text appears at bottom
- **Responsive**: Stacks on mobile, clear spacing

### Detail Drawer
- **Slide-in Animation**: Drawer slides in from right (fixed position)
- **Overlay**: Semi-transparent overlay behind drawer (clickable to close)
- **Scrollable Content**: Main content area scrolls if long
- **Fixed Footer**: Action buttons stay at bottom
- **Smooth Transitions**: Form transitions in footer change smoothly

### Interview Scheduling Form
- **Proposed Types**: Checkboxes with icons (📹 Online, 🏢 In-Person)
- **Validation**: At least one type must be selected
- **Timezone Selector**: Pre-populated with 14+ timezones
- **Notes Field**: Optional textarea for meeting details
- **Loading State**: Button shows "Scheduling..." when submitting

## Notifications

### To Candidate
- **Event**: Interview proposed
- **Type**: `interview_scheduled`
- **Action URL**: `/interviews/respond/[applicationId]`
- **Body**: "You've been invited for an interview for [Job Title]..."

### To HR
- **Event**: Candidate submits preference
- **Type**: `application_status_changed`
- **Action URL**: `/jobs/manage/[id]/applicants`
- **Body**: "[Candidate Name] has submitted their interview preference..."

## Integration Points

### Existing Systems
1. **Applications**: Status updated to `interview_scheduled`
2. **Notifications**: Leverages existing notification system
3. **Interviews**: Extends existing interviews table
4. **Jobs**: Links to job context via job_id

### Candidate-Side Response
- Candidate navigates to `/interviews/respond/[applicationId]`
- Existing component handles preference submission
- Need to create preference response UI component

## Database Migrations Required

Run these migrations in Supabase SQL editor:

```sql
-- 1. Add preference columns to interviews table
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS candidate_interview_type_preference interview_type;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS preference_submitted_at timestamptz;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS preference_status varchar(50) DEFAULT 'pending';

-- 2. Create interview_proposals table
CREATE TABLE IF NOT EXISTS interview_proposals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  interview_type interview_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(interview_id, interview_type)
);

-- 3. Create indices
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_preference ON interviews(application_id, preference_status);
CREATE INDEX IF NOT EXISTS idx_interview_proposals_interview_id ON interview_proposals(interview_id);
```

## Testing Checklist

- [ ] Click applicant card → drawer opens smoothly
- [ ] Close drawer button works
- [ ] Click "Schedule Interview" → form appears in footer
- [ ] Cancel form → returns to drawer view
- [ ] Select interview types → validation works
- [ ] Submit form → successful notification shown
- [ ] HR receives notification with interview details
- [ ] Candidate receives notification with response link
- [ ] Card shows interview scheduled with date/time
- [ ] Candidate can access preference response page
- [ ] Candidate preference updates correctly

## Future Enhancements

1. **Interview Confirmation**: Add candidate confirmation of attendance
2. **Scheduling Conflicts**: Check HR availability before proposing
3. **Calendar Integration**: Sync with Google Calendar / Outlook
4. **Video Room Creation**: Auto-create Daily.co room for online interviews
5. **Email Reminders**: Send reminders 24h before interview
6. **Feedback Forms**: Post-interview evaluation forms for interviewers
7. **Bulk Scheduling**: Schedule multiple interviews at once
8. **Interview Kit**: Send preparation materials to candidate before interview

## Troubleshooting

### Drawer not opening
- Check `isOpen` prop is being set correctly
- Verify overlay click handler `onClose` is firing
- Check z-index conflicts (should be z-50)

### Form not submitting
- Verify at least one interview type is selected
- Check server action is imported correctly
- Verify form field names match server action parameters
- Check browser console for errors

### Notifications not sending
- Verify notification table exists
- Check recipient_id is correct (should be candidate_id)
- Verify notification type is valid
- Check Supabase realtime subscriptions are enabled

## Support

For issues or questions, check:
1. Application logs in `/app/(dashboard)/applications/`
2. Interview scheduling logic in `actions.ts`
3. Type definitions in `/lib/types.ts`
