# Visual Component Map & Flow

## Component Hierarchy Diagram

```
[id]/page.tsx (Server)
    │
    ├─ Fetch application data from Supabase
    ├─ Verify user authentication
    ├─ Check access permissions
    └─ Pass data to client component
         │
         └─ ApplicationDetailView.tsx (Client)
             │
             ├─ Determine user role (HR vs Candidate)
             │
             ├─ COMMON TO BOTH:
             │  ├─ Header Section
             │  │   ├─ Avatar
             │  │   ├─ Name & Job Title
             │  │   ├─ Contact Info
             │  │   └─ Stats (Match Score, Applied Date)
             │  │
             │  ├─ ResumeViewer.tsx
             │  │   ├─ PDF View (iframe)
             │  │   ├─ Text View
             │  │   └─ Download Button
             │  │
             │  └─ InterviewTimeline.tsx
             │      ├─ Interview Cards
             │      ├─ Status Badges
             │      ├─ Details & Notes
             │      └─ Score Display
             │
             └─ ROLE-SPECIFIC:
                 │
                 ├─ IF HR Manager/Admin:
                 │  └─ EvaluationSidebar.tsx
                 │      ├─ Status Badge
                 │      ├─ Match Score Bar
                 │      ├─ Job Info Card
                 │      ├─ HR Notes Editor
                 │      │   └─ updateApplicationEvaluation()
                 │      │
                 │      ├─ Action Buttons
                 │      │   ├─ "Shortlist" → status: shortlisted
                 │      │   ├─ "Schedule Interview" → modal opens
                 │      │   │   └─ InterviewScheduler.tsx
                 │      │   │       └─ moveToInterview()
                 │      │   ├─ "Send Offer" → status: offer_sent
                 │      │   ├─ "Mark as Hired" → status: hired
                 │      │   └─ "Reject" → status: rejected
                 │      │
                 │      └─ Timeline Stats
                 │
                 └─ IF Candidate:
                    └─ StatusTracker.tsx
                        ├─ 7-Stage Pipeline
                        │   ├─ ✓ Submitted
                        │   ├─ 👁 Under Review
                        │   ├─ ⭐ Shortlisted
                        │   ├─ 📅 Interview Scheduled
                        │   ├─ 💬 Interviewed
                        │   ├─ 🎉 Offer Sent
                        │   └─ ✅ Hired
                        │
                        └─ Stage Messages
                            ├─ Current stage highlighted
                            ├─ Progress indicator
                            ├─ Interview details (if applicable)
                            └─ Contextual message
```

## Side-by-Side View Comparison

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                  SAME URL - DIFFERENT ROLE                 ┃
┃              /applications/550e8400-e29b-41d4              ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─────────────────────────────────┬───────────────────────────────┐
│     RECRUITER (HR Manager)      │   APPLICANT (Job Seeker)      │
├─────────────────────────────────┼───────────────────────────────┤
│                                 │                               │
│ HEADER (SHARED)                 │ HEADER (SHARED)               │
│ ┌─────────────────────────────┐ │ ┌─────────────────────────────┐
│ │ [Avatar] John Smith         │ │ │ [Avatar] John Smith         │
│ │ Product Manager             │ │ │ Product Manager             │
│ │ john@...  | +123456 | City  │ │ │ john@... | +123456 | City  │
│ │                             │ │ │                             │
│ │ Match: 75% | Applied: Apr15 │ │ │ Applied: Apr 15, 2024       │
│ └─────────────────────────────┘ │ └─────────────────────────────┘
│                                 │                               │
│ MAIN CONTENT (2/3)              │ MAIN CONTENT (FULL WIDTH)     │
│                                 │                               │
│ ┌─────────────────────────────┐ │ ┌─────────────────────────────┐
│ │     RESUME VIEWER           │ │ │    STATUS TRACKER 📊         │
│ │ ┌─────────────────────────┐ │ │ │                             │
│ │ │  [PDF/Text Toggle]      │ │ │ │ ✓ Application Submitted     │
│ │ │  [Resume PDF Display]   │ │ │ │         ↓                   │
│ │ │  [Download Button]      │ │ │ │ 👁 Under Review ← HERE      │
│ │ │                         │ │ │ │         ↓                   │
│ │ │ John's Professional     │ │ │ │ ⭐ Shortlisted             │
│ │ │ Resume...               │ │ │ │         ↓                   │
│ │ │                         │ │ │ │ 📅 Interview Scheduled     │
│ │ │                         │ │ │ │         ↓                   │
│ │ │                         │ │ │ │ 💬 Interviewed             │
│ │ │                         │ │ │ │         ↓                   │
│ │ │                         │ │ │ │ 🎉 Offer Sent              │
│ │ │                         │ │ │ │         ↓                   │
│ │ └─────────────────────────┘ │ │ │ ✅ Hired                    │
│ └─────────────────────────────┘ │ │                             │
│                                 │ │ ℹ️ Your application is being │
│ ┌─────────────────────────────┐ │ │ reviewed...                 │
│ │   INTERVIEW TIMELINE        │ │ └─────────────────────────────┘
│ │ ┌─────────────────────────┐ │ │
│ │ │ No interviews yet       │ │ │ ┌─────────────────────────────┐
│ │ │                         │ │ │ │        RESUME VIEWER        │
│ │ │                         │ │ │ │ Shared view (same as HR)    │
│ │ └─────────────────────────┘ │ │ └─────────────────────────────┘
│ └─────────────────────────────┘ │
│                                 │ ┌─────────────────────────────┐
│ ┌─────────────────────────────┐ │ │   INTERVIEW TIMELINE        │
│ │    COVER LETTER             │ │ │ Shared view (same as HR)    │
│ │ ┌─────────────────────────┐ │ │ └─────────────────────────────┘
│ │ │ "I am very interested   │ │ │
│ │ │ in this position..."    │ │ │ ┌─────────────────────────────┐
│ │ │                         │ │ │ │    COVER LETTER             │
│ │ │                         │ │ │ │ Shared view (same as HR)    │
│ │ │                         │ │ │ └─────────────────────────────┘
│ │ └─────────────────────────┘ │ │
│ └─────────────────────────────┘ │
│                                 │
│ SIDEBAR (1/3)                   │
│ ┌─────────────────────────────┐ │
│ │  EVALUATION SIDEBAR 🎯       │ │
│ ├─────────────────────────────┤ │
│ │ STATUS: Submitted (blue)    │ │
│ │ Match: ▓▓▓▓▓░░ 75%          │ │
│ │                             │ │
│ │ JOB INFO:                   │ │
│ │ • Product Manager           │ │
│ │ • San Francisco, CA         │ │
│ │ • $80k-120k/yr              │ │
│ │                             │ │
│ │ HR NOTES:                   │ │
│ │ ┌───────────────────────────┐│
│ │ │ Great communication skills│
│ │ │ Matches requirements well │
│ │ └───────────────────────────┘│
│ │ [Save Notes]                │ │
│ │                             │ │
│ │ ACTIONS:                    │ │
│ │ [🌟 Shortlist]              │ │
│ │ [❌ Reject]                 │ │
│ │                             │ │
│ │ TIMELINE:                   │ │
│ │ Applied: 6 days ago         │ │
│ └─────────────────────────────┘ │
│                                 │
└─────────────────────────────────┴───────────────────────────────┘
```

## Data Flow Diagram

```
DATABASE (Supabase)
    │
    ├─ applications
    │   ├─ id
    │   ├─ status
    │   ├─ match_score
    │   ├─ hr_notes
    │   └─ submitted_at
    │
    ├─ profiles
    │   ├─ first_name
    │   ├─ last_name
    │   ├─ email
    │   └─ avatar_url
    │
    ├─ resumes
    │   ├─ pdf_url
    │   └─ content_text
    │
    ├─ job_postings
    │   ├─ title
    │   ├─ location
    │   └─ salary
    │
    └─ interviews
        ├─ scheduled_at
        ├─ interview_type
        └─ status
             │
             └─ [id]/page.tsx (SSR Fetch)
                  │
                  └─ ApplicationDetailView (Client Logic)
                      │
                      └─ Server Actions
                          ├─ updateApplicationEvaluation()
                          │   └─ Updates: status, hr_notes
                          │       └─ Revalidates paths
                          │
                          ├─ moveToInterview()
                          │   ├─ Updates: status → interview_scheduled
                          │   └─ Creates: new interview record
                          │
                          ├─ rejectCandidate()
                          │   └─ Updates: status → rejected
                          │
                          ├─ offerPosition()
                          │   └─ Updates: status → offer_sent
                          │
                          └─ markAsHired()
                              └─ Updates: status → hired
```

## URL Structure

```
/applications
├─ /[id]                    ← Detail page
│   ├─ params: { id: "uuid" }
│   ├─ Access: GET (view)
│   └─ Display: Based on user role
│
└─ (other: list, manage, etc.)

EXAMPLE URLs:
/applications                                    # List all
/applications/550e8400-e29b-41d4-a716           # Detail view
```

## State Management Flow

```
ApplicationDetailView
    │
    ├─ State:
    │   ├─ applicationStatus (from props)
    │   └─ refreshTrigger (for data refresh)
    │
    ├─ Props Passed:
    │   ├─ application → All child components
    │   ├─ interviews → InterviewTimeline
    │   ├─ userRole → Conditional rendering
    │   └─ isCurrentUser → Permission checks
    │
    └─ Callbacks:
        └─ onStatusUpdate()
            └─ Triggered by server actions
                └─ Revalidates page data
                    └─ Shows fresh state
```

## Action Button Flow

```
Recruiter clicks "Shortlist"
    ↓
onClick handler in EvaluationSidebar
    ↓
handleStatusChange("shortlisted") called
    ↓
formData prepared with:
    - application_id
    - status: "shortlisted"
    - hr_notes (if edited)
    ↓
updateApplicationEvaluation(formData) server action
    ↓
Server verifies:
    - User is authenticated
    - User is HR Manager/Admin
    - Application exists
    ↓
Database update (atomic transaction)
    ↓
Paths revalidated:
    - /applications
    - /applications/[id]
    ↓
Page re-fetches fresh data
    ↓
UI updates to show new state
    ├─ Status badge changes color
    ├─ Available buttons update
    └─ Interview timeline refreshes
```

## Mobile Responsive Breakdown

```
DESKTOP (1024px+)
┌──────────────────────────────────┐
│ Header (Full Width)              │
├──────────────────────┬───────────┤
│ Main Content (2/3)   │ Sidebar   │
│                      │ (1/3)     │
│ ├─ Status Tracker    │ ├─ Status │
│ ├─ Resume            │ ├─ Notes  │
│ ├─ Interviews        │ └─ Actions│
│ └─ Cover Letter      │           │
└──────────────────────┴───────────┘

TABLET (640px-1023px)
┌──────────────────────────────────┐
│ Header (Full Width)              │
├──────────────────────────────────┤
│ Main Content (Full)              │
├──────────────────────────────────┤
│ Status Tracker / Pipeline        │
├──────────────────────────────────┤
│ Resume                           │
├──────────────────────────────────┤
│ Sidebar (Full Width)             │
├──────────────────────────────────┤
│ Interviews, Cover Letter         │
└──────────────────────────────────┘

MOBILE (< 640px)
┌──────────────────────────────────┐
│ Header (Compact)                 │
├──────────────────────────────────┤
│ Status Tracker (Vertical)        │
├──────────────────────────────────┤
│ Match Score                      │
├──────────────────────────────────┤
│ Resume (Scrollable)              │
├──────────────────────────────────┤
│ Sidebar (Vertical Cards)         │
├──────────────────────────────────┤
│ Interviews                       │
├──────────────────────────────────┤
│ Cover Letter                     │
└──────────────────────────────────┘

Responsive Classes Used:
- lg:col-span-2  (desktop: 2/3 width)
- lg:grid-cols-3 (desktop: 3 column grid)
- flex-col       (mobile: stack vertical)
- max-h-[90vh]   (modals: prevent overflow)
```

---

This visual guide helps understand the structure, data flow, and responsive behavior of the entire system at a glance.
