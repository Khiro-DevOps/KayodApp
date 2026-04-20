# Job Application Detail Feature - Architecture & Integration

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Detail Page                   │
│                    /applications/[id]                        │
│                 (Server Component - SSR)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
        ┌───────▼────────┐   ┌────────▼────────┐
        │  Fetch from    │   │ Access Control  │
        │ Supabase DB    │   │  & Permission   │
        │  (queries,     │   │    Checks       │
        │ interviews)    │   └────────┬────────┘
        └────────┬───────┘           │
                 │                   │
        ┌────────▼───────────────────┴──────────┐
        │      Pass Data to Client Component    │
        │      ApplicationDetailView.tsx        │
        └────────┬──────────────────────────────┘
                 │
        ┌────────▼──────────────────────────────┐
        │   User Role Check (Client-side UI)    │
        └────────┬──────────────────────────────┘
                 │
        ┌────────┴─────────────────┐
        │                          │
   ┌────▼──────────────────┐  ┌───▼────────────────────┐
   │   RECRUITER VIEW       │  │   APPLICANT VIEW       │
   │ (HR Manager/Admin)     │  │  (Job Seeker)          │
   ├────────────────────────┤  ├────────────────────────┤
   │ • Application Header   │  │ • Application Header   │
   │ • Resume Viewer        │  │ • Status Tracker       │
   │ • Interview Timeline   │  │ • Interview Timeline   │
   │ • Cover Letter         │  │ • Cover Letter         │
   │ • Evaluation Sidebar   │  │                        │
   │   - Match Score        │  │                        │
   │   - HR Notes Editor    │  │                        │
   │   - Job Info           │  │                        │
   │   - Action Buttons     │  │                        │
   └────┬──────────────────┘  └────────────────────────┘
        │
        └────┬──────────────────┐
             │                  │
        ┌────▼───────────────┐ │
        │ Server Actions:   │ │
        │ • Status Update   │ │
        │ • Schedule Int.   │ │
        │ • Reject/Offer    │ │
        │ • Mark Hired      │ │
        └──────┬────────────┘ │
               │              │
               └──────┬───────┘
                      │
               ┌──────▼─────────────┐
               │  Update in DB      │
               │  Revalidate Paths  │
               └────────────────────┘
```

## Component Hierarchy

```
[id]/page.tsx (Server)
    └─ ApplicationDetailView (Client)
        ├─ Header Section
        │   ├─ Candidate Avatar & Info
        │   ├─ Contact Details
        │   └─ Quick Stats (Match Score, Applied Date)
        │
        ├─ Main Content (2/3 width)
        │   ├─ StatusTracker (Applicants Only)
        │   │   └─ Pipeline Stages with Icons
        │   │   └─ Stage Details & Messages
        │   │
        │   ├─ ResumeViewer
        │   │   ├─ PDF View (iframe)
        │   │   └─ Text View
        │   │
        │   ├─ InterviewTimeline (if interviews exist)
        │   │   └─ Timeline Cards with Status
        │   │   └─ Interview Details
        │   │   └─ Score & Notes (Recruiter)
        │   │
        │   └─ Cover Letter (if exists)
        │
        └─ Sidebar (1/3 width - Recruiters Only)
            ├─ EvaluationSidebar
            │   ├─ Current Status Badge
            │   ├─ Match Score Progress
            │   ├─ Job Information
            │   ├─ HR Notes Editor
            │   ├─ Action Buttons
            │   └─ Timeline Stats
            │
            └─ InterviewScheduler (Modal)
                ├─ Interview Type Selection
                ├─ Date/Time Picker
                ├─ Duration Selection
                ├─ Timezone Selection
                ├─ Location/Video Details
                └─ Submit Action
```

## Data Flow for Status Update

### Recruiter clicks "Shortlist" button:

```
1. User clicks button in EvaluationSidebar
   ↓
2. onClick handler calls updateApplicationEvaluation(formData)
   ↓
3. Server Action (application-detail-actions.ts):
   - Verify user is authenticated
   - Verify user is HR Manager/Admin
   - Update applications table (status = 'shortlisted')
   ↓
4. Database is updated
   ↓
5. Server revalidates paths:
   - /applications
   - /applications/[id]
   ↓
6. Client refetches data (via onStatusUpdate callback)
   ↓
7. UI updates to show new status
   ↓
8. Notification could be sent to applicant (future)
```

## Interview Scheduling Flow

### Recruiter clicks "Schedule Interview":

```
1. User clicks "Schedule Interview" in EvaluationSidebar
   ↓
2. InterviewScheduler modal opens (showScheduleForm state)
   ↓
3. Recruiter fills form:
   - Interview type (online/in-person)
   - Date & time
   - Duration
   - Timezone
   - Location or video room name
   ↓
4. Form submitted → moveToInterview(formData) called
   ↓
5. Server Action:
   - Verify user is HR Manager/Admin
   - Update application status to 'interview_scheduled'
   - Create interview record in interviews table
   - Link interview to application
   ↓
6. Database updated with:
   - applications: status = 'interview_scheduled'
   - interviews: new record with all details
   ↓
7. Paths revalidated
   ↓
8. UI updates:
   - Evaluation sidebar changes available actions
   - InterviewTimeline shows new interview
   - StatusTracker moves to "Interview Scheduled" stage
   ↓
9. Notification sent to applicant (future)
```

## Database Schema Integration

### Relevant Tables & Columns:

```sql
-- applications table
applications {
  id UUID PRIMARY KEY
  job_posting_id UUID (FK)
  candidate_id UUID (FK) → profiles.id
  resume_id UUID (FK) → resumes.id
  status application_status (ENUM)
  cover_letter TEXT
  match_score NUMERIC(5,2)
  hr_notes TEXT
  submitted_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
}

-- interviews table (related)
interviews {
  id UUID PRIMARY KEY
  application_id UUID (FK) → applications.id
  scheduled_by UUID (FK) → profiles.id
  interview_type interview_type (online|in_person)
  status interview_status
  scheduled_at TIMESTAMPTZ
  duration_minutes INT
  timezone TEXT
  location_address TEXT (for in-person)
  video_room_url TEXT (for online)
  interviewer_notes TEXT
  interview_score NUMERIC
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
}

-- profiles table (candidate info)
profiles {
  id UUID PRIMARY KEY
  first_name TEXT
  last_name TEXT
  email TEXT
  phone TEXT
  avatar_url TEXT
  city TEXT
  country TEXT
}

-- resumes table (for viewer)
resumes {
  id UUID PRIMARY KEY
  candidate_id UUID (FK)
  title TEXT
  pdf_url TEXT
  content_text TEXT
  created_at TIMESTAMPTZ
}

-- job_postings table (for job details)
job_postings {
  id UUID PRIMARY KEY
  title TEXT
  location TEXT
  description TEXT
  salary_min NUMERIC
  salary_max NUMERIC
  currency TEXT
  employment_type employment_type
  ...
}
```

## Environment Variables Required

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Optional: For Daily.co video interviews (future enhancement)
# NEXT_PUBLIC_DAILY_API_KEY=your_daily_api_key
```

## Integration with Existing Features

### Connects with:
1. **Job Postings** - Shows job details in sidebar
2. **Resumes** - Displays candidate's resume
3. **Interviews** - Shows all scheduled interviews
4. **Notifications** - (Future) Send updates when status changes
5. **Employees** - (Future) Create employee record when hired

### Depends on:
1. **Supabase Auth** - User authentication & roles
2. **Supabase Database** - Persistent data storage
3. **Tailwind CSS** - Styling
4. **Next.js 16** - Framework & server components

## Error Handling

All Server Actions include:
- Try-catch blocks
- User permission verification
- Database error handling
- Automatic revalidation

## Performance Optimizations

1. **Server-Side Rendering** - Initial data fetch on server
2. **Efficient Queries** - Single query with joins, no N+1
3. **Revalidation** - Only affected paths refresh
4. **Component Memoization** - Client components optimized
5. **Lazy Loading** - Timeline and modals load on demand

## Testing Strategy

### Unit Tests:
- Component rendering with different roles
- Status calculations
- Date formatting

### Integration Tests:
- Database updates through server actions
- Permission checks
- Data consistency after updates

### E2E Tests:
- Full recruiter flow (view → evaluate → schedule)
- Full applicant flow (view application → track status)
- Interview scheduling process

## Security Considerations

1. **Row-Level Security (RLS)** - Should be enabled on Supabase
2. **Role-Based Access** - Verified on server
3. **Server Actions** - All mutations handled server-side
4. **CSRF Protection** - Built into Next.js
5. **XSS Prevention** - React escaping + sanitization

## Future Enhancements Roadmap

### Phase 2:
- [ ] Email notifications for status changes
- [ ] Applicant decision (accept/decline offer)
- [ ] Interview feedback form
- [ ] Score calculation

### Phase 3:
- [ ] Daily.co video call integration
- [ ] Bulk status updates
- [ ] Application comments/threads
- [ ] Document uploads

### Phase 4:
- [ ] Analytics dashboard
- [ ] Hiring pipeline metrics
- [ ] Interview question templates
- [ ] Candidate rankings
