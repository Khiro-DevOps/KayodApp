# Job Application Detail View - Implementation Guide

## Overview

The Job Application Detail view is a dual-interface system that displays different information based on the user's role:

- **Recruiter View** (HR Manager/Admin): Full application details, resume viewer, evaluation sidebar with action buttons
- **Applicant View** (Job Seeker): Read-only status tracker showing their position in the hiring pipeline

## Architecture

### File Structure

```
app/(dashboard)/applications/
├── [id]/
│   └── page.tsx                          # Detail page (Server Component)
├── application-detail-view.tsx           # Main component (Client)
├── application-detail-actions.ts         # Server actions for status updates
├── resume-viewer.tsx                     # Resume PDF/text viewer
├── status-tracker.tsx                    # Applicant pipeline view
├── evaluation-sidebar.tsx                # Recruiter evaluation tools
└── interview-timeline.tsx                # Interview history component
```

## Component Breakdown

### 1. **Detail Page** (`[id]/page.tsx`)
- **Type**: Server Component
- **Purpose**: Fetch application data from Supabase and handle access control
- **Key Features**:
  - Verifies user is authenticated
  - Checks role and permissions (HR can view all, candidates can only view their own)
  - Fetches application with full relational data
  - Fetches associated interviews

### 2. **Application Detail View** (`application-detail-view.tsx`)
- **Type**: Client Component
- **Purpose**: Main layout component that conditionally renders recruiter or applicant view
- **Props**:
  - `application`: Full application object with joined data
  - `interviews`: Array of interview records
  - `userRole`: User's role (candidate, hr_manager, admin)
  - `isCurrentUser`: Whether viewing own application

### 3. **Resume Viewer** (`resume-viewer.tsx`)
- **Type**: Client Component
- **Features**:
  - Toggle between PDF and text view
  - PDF embedded viewer (iframe)
  - Plain text resume display
  - Download PDF button
  - Fallback for missing content

### 4. **Status Tracker** (`status-tracker.tsx`)
- **Type**: Client Component (Applicant View Only)
- **Pipeline Stages**:
  1. Application Submitted ✓
  2. Under Review 👁
  3. Shortlisted ⭐
  4. Interview Scheduled 📅
  5. Interviewed 💬
  6. Offer Sent 🎉
  7. Hired ✅

- **Features**:
  - Visual progress indicator
  - Stage-specific information
  - Interview details when applicable
  - Contextual messages for each stage

### 5. **Evaluation Sidebar** (`evaluation-sidebar.tsx`)
- **Type**: Client Component (Recruiter View Only)
- **Features**:
  - Current application status display
  - Match score with progress bar
  - Job information summary
  - HR notes editor (with save)
  - Action buttons for status transitions
  - Timeline showing days in pipeline

- **Status Transitions**:
  - `submitted` → `shortlisted` or `rejected`
  - `shortlisted` → `interview_scheduled` or `rejected`
  - `interview_scheduled` → `interviewed` or `rejected`
  - `interviewed` → `offer_sent` or `rejected`
  - `offer_sent` → `hired` or `rejected`

### 6. **Interview Timeline** (`interview-timeline.tsx`)
- **Type**: Client Component
- **Features**:
  - Displays all interviews for an application
  - Shows status badge for each interview
  - Interview details (date, time, type, location/video link)
  - For completed interviews: score and interviewer notes
  - Visual timeline representation

## Application Status Enum

The system uses these statuses from your existing schema:

```typescript
type ApplicationStatus =
  | "draft"               // Not submitted yet
  | "submitted"           // Initial submission
  | "under_review"        // HR is reviewing
  | "shortlisted"         // Candidate passed initial screening
  | "interview_scheduled" // Interview has been scheduled
  | "interviewed"         // Interview completed
  | "offer_sent"          // Job offer extended
  | "hired"               // Candidate accepted offer
  | "rejected"            // Application rejected
  | "withdrawn";          // Candidate withdrew
```

## Server Actions (`application-detail-actions.ts`)

### `updateApplicationEvaluation(formData)`
Updates application status and/or HR notes.

**Parameters**:
- `application_id`: Must be included
- `status`: (optional) New status
- `hr_notes`: (optional) HR notes

**Access**: HR Manager / Admin only

### `moveToInterview(formData)`
Moves candidate to interview stage and creates interview record.

**Parameters**:
- `application_id`: Required
- `scheduled_at`: Interview date/time (ISO string)
- `interview_type`: "online" or "in_person"
- `duration_minutes`: Interview duration (default: 60)
- `timezone`: Timezone (default: "Asia/Manila")
- `location_address`: For in-person interviews
- `location_notes`: Additional location info
- `video_room_name`: For online interviews

**Access**: HR Manager / Admin only

### `rejectCandidate(applicationId, reason?)`
Rejects a candidate application.

**Parameters**:
- `applicationId`: Application ID
- `reason`: (optional) Rejection reason

**Access**: HR Manager / Admin only

### `offerPosition(applicationId)`
Sends job offer to candidate.

**Parameters**:
- `applicationId`: Application ID

**Access**: HR Manager / Admin only

### `markAsHired(applicationId)`
Marks candidate as hired (moves to employee).

**Parameters**:
- `applicationId`: Application ID

**Access**: HR Manager / Admin only

## Database Relations

The component relies on these Supabase joins:

```sql
applications
├── profiles (candidate info)
├── resumes (candidate's resume)
├── job_postings (job details)
└── interviews (interview records)
    └── profiles (interviewer info)
```

## UI/UX Flow

### For Recruiters:
1. View complete application with match score
2. See candidate details and resume
3. Read/write HR notes
4. Review interview history (if any)
5. Take action: Shortlist, Schedule Interview, Make Offer, or Reject
6. Progress candidate through pipeline

### For Applicants:
1. See visual status tracker
2. Understand current pipeline stage
3. View interview details when scheduled
4. Read application submission date
5. See status-specific messages

## Styling Conventions

Uses Tailwind CSS with project's custom color scheme:
- `bg-surface`: Card backgrounds
- `border-border`: Border color
- `text-text-primary`: Main text
- `text-text-secondary`: Secondary text
- `bg-primary`: Primary actions
- Status colors: Blue (submitted), Yellow (shortlisted), Purple (interviewed), Green (hired), Red (rejected)

## Performance Considerations

- Server-side data fetching (no N+1 queries)
- Memoization of heavy components where needed
- Lazy-loaded interview timeline
- Server actions for mutations (automatic revalidation)

## Security

- Access control at page level (HR can view all, candidates can only view own)
- Server-side authorization in all server actions
- Role verification before allowing status updates
- No sensitive data exposed to unauthorized users

## Future Enhancements

1. **Schedule Interview Modal**: UI for scheduling interviews dynamically
2. **Email Notifications**: Send emails when status changes
3. **Interview Feedback Form**: Structured feedback after interviews
4. **Bulk Actions**: Update multiple applications at once
5. **Analytics**: Track time in each stage, conversion rates
6. **Comments**: Add comments/threads on applications
7. **Document Upload**: Additional documents beyond resume
8. **Integration**: Sync with Daily.co for video interviews

## Usage Example

```typescript
// Recruiter navigates to an application
// /applications/[application-id] → Shows evaluation sidebar

// Applicant navigates to their application
// /applications/[application-id] → Shows status tracker

// Recruiter updates status
const formData = new FormData();
formData.append("application_id", "abc-123");
formData.append("status", "shortlisted");
formData.append("hr_notes", "Great match for the role");

await updateApplicationEvaluation(formData);
```

## Testing Checklist

- [ ] Recruiter can view all applications
- [ ] Candidate can only view own application
- [ ] Resume viewer works with PDF and text
- [ ] Status tracker shows correct pipeline
- [ ] Action buttons transition status correctly
- [ ] HR notes save and persist
- [ ] Interview timeline displays correctly
- [ ] Unauthorized access is blocked
- [ ] Real-time updates on status change
- [ ] Match score displays and sorts correctly
