# Interview Scheduling - Database Schema & API Reference

## Database Schema

### Overview
The interview scheduling system uses three main tables:
1. `interviews` - Primary interview records
2. `interview_proposals` - Proposed interview type options
3. `applications` - Linked application records

### Table Modifications

#### interviews (Existing Table - 3 New Columns)

**Schema Update**:
```sql
ALTER TABLE interviews 
ADD COLUMN candidate_interview_type_preference interview_type,
ADD COLUMN preference_submitted_at timestamptz,
ADD COLUMN preference_status varchar(50) DEFAULT 'pending';
```

**Column Details**:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | uuid_generate_v4() | Primary key |
| `application_id` | uuid | - | FK to applications |
| `scheduled_by` | uuid | - | FK to profiles (HR who scheduled) |
| `interview_type` | enum | 'online' | HR's proposed primary type |
| `status` | enum | 'scheduled' | Interview booking status |
| `scheduled_at` | timestamptz | - | Proposed interview time |
| `duration_minutes` | int | 60 | Interview duration |
| `timezone` | text | 'Asia/Manila' | Timezone for interview |
| `location_address` | text | NULL | In-person location |
| `location_notes` | text | NULL | Additional location info |
| `video_room_url` | text | NULL | Daily.co or Zoom link |
| `interviewer_notes` | text | NULL | HR's notes/agenda |
| `interview_score` | int | NULL | 1-10 rating after interview |
| **`candidate_interview_type_preference`** | **enum** | **NULL** | **⭐ NEW: Candidate's choice** |
| **`preference_submitted_at`** | **timestamptz** | **NULL** | **⭐ NEW: When preference submitted** |
| **`preference_status`** | **varchar(50)** | **'pending'** | **⭐ NEW: pending/submitted/confirmed** |
| `created_at` | timestamptz | now() | Creation timestamp |
| `updated_at` | timestamptz | now() | Update timestamp |

**Indices**:
```sql
CREATE INDEX idx_interviews_candidate_preference 
ON interviews(application_id, preference_status);
```

---

### interview_proposals (New Table)

**Purpose**: Store the available interview type options HR proposes to candidate

**Schema**:
```sql
CREATE TABLE interview_proposals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  interview_type interview_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(interview_id, interview_type)
);
```

**Column Details**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Unique identifier |
| `interview_id` | uuid | FK, NOT NULL | References interviews |
| `interview_type` | enum | NOT NULL | 'online' or 'in_person' |
| `created_at` | timestamptz | NOT NULL, DEFAULT | Creation timestamp |
| `updated_at` | timestamptz | NOT NULL, DEFAULT | Update timestamp |

**Constraints**:
- `UNIQUE(interview_id, interview_type)` - Each type proposed only once per interview
- `FOREIGN KEY interview_id` - Cascade delete when interview deleted

**Indices**:
```sql
CREATE INDEX idx_interview_proposals_interview_id 
ON interview_proposals(interview_id);
```

**Example Data**:
```sql
-- Interview 123 offers both online and in-person
INSERT INTO interview_proposals (interview_id, interview_type)
VALUES 
  ('123abc...', 'online'),
  ('123abc...', 'in_person');

-- Candidate selects 'online' in interviews.candidate_interview_type_preference
```

---

## Data Flow Workflows

### Workflow 1: HR Proposes Interview (Happy Path)

```
┌──────────────────┐
│ HR Opens App     │
│ Clicks Card      │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Drawer Opens                     │
│ - Shows applicant details        │
│ - Shows match score              │
│ - Resume visible                 │
└────────┬───────────────────────┬─┘
         │                       │
    Cancel│                       │Schedule
         │                       ▼
         │          ┌────────────────────┐
         │          │ Scheduling Form    │
         │          │ - Date/Time        │
         │          │ - Timezone         │
         │          │ - Type Checkboxes  │
         │          │ - Notes            │
         │          └────────┬───────────┘
         │                   │
         │            Submit │
         │                   ▼
         │       ┌─────────────────────────┐
         │       │ scheduleInterviewProposal │ (Server Action)
         │       │ Action: CREATE/UPDATE   │
         │       │ 1. Create interview     │
         │       │ 2. Create proposals     │
         │       │ 3. Update app status    │
         │       │ 4. Send notification    │
         │       └────────┬────────────────┘
         │                │
         │                ├─✅ On Success
         │                │   - Close drawer
         │                │   - Show success toast
         │                │   - Update card UI
         │                │
         │                └─❌ On Error
         │                    - Show error message
         │                    - Keep form visible
         │
         └─────────► Return to Applicants List
```

---

### Workflow 2: Candidate Responds (Response Flow)

```
┌───────────────────────┐
│ Candidate Receives    │
│ Email Notification    │
│ "You've been invited" │
└──────────┬────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Clicks email link            │
│ Navigates to:                │
│ /interviews/respond/[appId]  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Interview Response Page          │
│ Shows:                           │
│ - Proposed interview options     │
│ - Date/Time                      │
│ - HR notes                       │
│ - Join now / Accept buttons      │
└──────────┬───────────────────────┘
           │
      Select │ Online or In-Person
           │
           ▼
┌──────────────────────────────────┐
│ submitInterviewPreference        │ (Server Action)
│ Updates:                         │
│ 1. candidate_interview_..        │
│    type_preference              │
│ 2. preference_submitted_at       │
│ 3. preference_status →           │
│    'submitted'                   │
│ 4. Send HR notification          │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ ✅ Preference Recorded           │
│ - Candidate sees confirmation    │
│ - HR sees update on card         │
│ - Both notified                  │
└──────────────────────────────────┘
```

---

## API/Server Actions Reference

### `scheduleInterviewProposal(formData: FormData)`

**Location**: `app/(dashboard)/jobs/manage/[id]/applicants/actions.ts`

**Purpose**: HR proposes an interview with options for candidate to choose from

**Input Parameters**:
```typescript
{
  application_id: string;      // UUID of application
  job_id: string;              // UUID of job posting
  scheduled_at: string;        // ISO datetime string
  timezone: string;            // IANA timezone (e.g., "Asia/Manila")
  interview_types: string[];   // ["online"] or ["in_person"] or both
  notes?: string;              // Optional HR notes/agenda
}
```

**Processing Steps**:
1. ✅ Authenticate user (must be HR)
2. ✅ Validate all required fields present
3. ✅ Fetch application context
4. ✅ Check if interview exists
   - If exists: UPDATE
   - If not: CREATE with status='scheduled'
5. ✅ Create interview_proposals records for each type
6. ✅ Update application status → 'interview_scheduled'
7. ✅ Create notification for candidate
8. ✅ Revalidate cache paths

**Response**:
```typescript
{
  success: boolean;
  interviewId?: string;  // Interview ID if successful
  error?: string;        // Error message if failed
}
```

**Error Handling**:
- Not authenticated → "Not authenticated"
- Missing fields → "Missing required fields"
- No such application → "Application not found"
- Database error → Thrown error message

**Database Mutations**:
```sql
-- 1. Create/update interview
INSERT/UPDATE interviews
SET scheduled_at = $1, timezone = $2, preference_status = 'pending'
WHERE id = $3;

-- 2. Create proposal options
INSERT INTO interview_proposals (interview_id, interview_type)
VALUES ($1, 'online'), ($1, 'in_person');

-- 3. Update application status
UPDATE applications
SET status = 'interview_scheduled'
WHERE id = $1;

-- 4. Create notification
INSERT INTO notifications (recipient_id, type, title, body, action_url)
VALUES ($1, 'interview_scheduled', 'Interview Invitation 🎉', ...)
```

---

### `submitInterviewPreference(formData: FormData)`

**Location**: `app/(dashboard)/jobs/manage/[id]/applicants/actions.ts`

**Purpose**: Candidate submits their preferred interview format

**Input Parameters**:
```typescript
{
  application_id: string;  // UUID of application
  preferred_type: string;  // "online" or "in_person"
}
```

**Validation**:
- `preferred_type` must be "online" or "in_person"
- Must match one of the proposed types
- Interview must exist for this application

**Processing Steps**:
1. ✅ Authenticate user (must be candidate)
2. ✅ Validate preference value
3. ✅ Fetch interview record
4. ✅ Update preference fields:
   - `candidate_interview_type_preference` = preference
   - `preference_submitted_at` = now()
   - `preference_status` = 'submitted'
5. ✅ Notify HR staff
6. ✅ Revalidate cache

**Response**:
```typescript
{
  success: boolean;
  error?: string;
}
```

**Database Mutations**:
```sql
UPDATE interviews
SET 
  candidate_interview_type_preference = $1,
  preference_submitted_at = now(),
  preference_status = 'submitted'
WHERE id = (SELECT id FROM interviews WHERE application_id = $2);

INSERT INTO notifications (recipient_id, type, title, body)
VALUES (...);  -- Notify HR
```

---

## State Machine: Interview Preference Status

```
┌─────────────┐
│  Scheduled  │ ◄─── Interview created by HR
└──────┬──────┘
       │
       │ HR proposes options
       │
       ▼
┌─────────────────┐
│  pending        │ ◄─── Waiting for candidate response
│  Candidate view │
├─────────────────┤
│ Can respond at: │
│ /interviews/... │
└──────┬──────────┘
       │
       │ Candidate selects preference
       │
       ▼
┌──────────────────┐
│  submitted       │ ◄─── Candidate has chosen
│  HR can see      │      Online or In-Person
│  preference UI   │
└──────┬───────────┘
       │
       │ HR confirms/updates interview
       │
       ▼
┌──────────────────┐
│  confirmed       │ ◄─── Final confirmation
│  Both parties    │      Ready for interview day
│  have clarity    │
└──────────────────┘
```

---

## Query Patterns

### Get Interview with Proposals
```sql
SELECT 
  i.*,
  array_agg(ip.interview_type) as proposed_types
FROM interviews i
LEFT JOIN interview_proposals ip ON i.id = ip.interview_id
WHERE i.application_id = $1
GROUP BY i.id;
```

### Find Pending Responses
```sql
SELECT 
  i.*,
  a.candidate_id,
  p.email as candidate_email
FROM interviews i
JOIN applications a ON i.application_id = a.id
JOIN profiles p ON a.candidate_id = p.id
WHERE i.preference_status = 'pending'
AND i.scheduled_at > now()
ORDER BY i.scheduled_at ASC;
```

### Get Candidate Preference
```sql
SELECT 
  i.candidate_interview_type_preference,
  i.preference_submitted_at,
  i.preference_status,
  ip.interview_type as proposed_option
FROM interviews i
LEFT JOIN interview_proposals ip ON i.id = ip.interview_id
WHERE i.application_id = $1;
```

---

## Migration Script

Run in Supabase SQL Editor (paste entire block):

```sql
-- Add columns to interviews
ALTER TABLE interviews 
ADD COLUMN IF NOT EXISTS candidate_interview_type_preference interview_type;
ALTER TABLE interviews 
ADD COLUMN IF NOT EXISTS preference_submitted_at timestamptz;
ALTER TABLE interviews 
ADD COLUMN IF NOT EXISTS preference_status varchar(50) DEFAULT 'pending';

-- Create interview_proposals table
CREATE TABLE IF NOT EXISTS interview_proposals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  interview_type interview_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(interview_id, interview_type)
);

-- Create indices
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_preference 
ON interviews(application_id, preference_status);

CREATE INDEX IF NOT EXISTS idx_interview_proposals_interview_id 
ON interview_proposals(interview_id);

-- Verify
SELECT 'Migration complete' as status;
```

---

## Enum Types Reference

### interview_type
- `'online'` - Video call interview (Daily.co/Zoom)
- `'in_person'` - Face-to-face at office

### interview_status (Existing)
- `'scheduled'` - Booked, waiting for confirmation
- `'confirmed'` - Both parties confirmed
- `'completed'` - Interview happened
- `'cancelled'` - Cancelled by either party
- `'rescheduled'` - Moved to new time
- `'no_show'` - Candidate didn't attend

### preference_status (New)
- `'pending'` - Waiting for candidate response
- `'submitted'` - Candidate selected their preference
- `'confirmed'` - Interview confirmed with selected preference

---

## Error Codes & Handling

| Scenario | Error Message | HTTP Status | Action |
|----------|---------------|------------|--------|
| Not authenticated | "Not authenticated" | 401 | Redirect to login |
| Missing fields | "Missing required fields" | 400 | Show form validation |
| Invalid type | "Invalid interview type" | 400 | Reset form |
| App not found | "Application not found" | 404 | Navigate back |
| No interview | "Interview not found" | 404 | Create new interview |
| DB error | Error message | 500 | Retry, then escalate |

---

## Performance Considerations

### Indices Created
```sql
-- Fast lookup by candidate preference status
CREATE INDEX idx_interviews_candidate_preference 
ON interviews(application_id, preference_status);

-- Fast lookup by interview
CREATE INDEX idx_interview_proposals_interview_id 
ON interview_proposals(interview_id);
```

### Query Optimization
- Use indexed columns in WHERE clauses
- Avoid N+1 queries (use JOINs not separate queries)
- Pre-fetch interview_proposals in main query
- Limit notifications lookups to recent entries

### Caching Strategy
```typescript
// Revalidate these paths after mutations:
revalidatePath(`/jobs/manage/${jobId}/applicants`);
revalidatePath(`/applications/${applicationId}`);
revalidatePath(`/interviews/respond/${applicationId}`);
```
