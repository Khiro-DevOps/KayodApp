# Job Application Detail - Usage Examples & Patterns

## 1. Viewing an Application as a Recruiter

### URL Access:
```
/applications/550e8400-e29b-41d4-a716-446655440000
```

### What They See:
1. **Header Section**
   - Candidate name, photo, contact info
   - Match score (75%)
   - Application submission date

2. **Resume Viewer**
   - Toggle between PDF and text view
   - Download PDF button

3. **Interview Timeline**
   - Any scheduled/completed interviews
   - Scores and notes from previous interviews

4. **Evaluation Sidebar**
   - Current status badge (blue: "Submitted")
   - Match score with progress bar
   - Job details summary
   - HR notes editor
   - Action buttons:
     - "Shortlist" (if status is submitted)
     - "Reject" (always available)

### Example Recruiter Workflow:

```typescript
// 1. Recruiter views application
// Page loads with all data

// 2. Reviews resume and cover letter
// Uses resume viewer to read PDF

// 3. Decides to shortlist
// Clicks "Shortlist" button

// 4. Writes notes
// "Great communication skills, matches 3/5 required skills"
// Clicks "Save Notes"

// 5. Schedules interview
// Clicks "Schedule Interview"
// Modal opens for interview details
// Fills in date, time, location
// Creates interview record

// 6. Applicant is now in "Interview Scheduled" stage
// Applicant can see interview details
// Receives notification (optional)
```

## 2. Viewing an Application as a Job Seeker

### URL Access:
```
/applications/550e8400-e29b-41d4-a716-446655440000
```

### What They See:
1. **Status Tracker (Animated Pipeline)**
   ```
   ✓ Application Submitted (completed)
   👁 Under Review (current stage)
   ⭐ Shortlisted (upcoming)
   📅 Interview Scheduled (upcoming)
   💬 Interviewed (upcoming)
   🎉 Offer Sent (upcoming)
   ✅ Hired (upcoming)
   ```

2. **Current Stage Information**
   - "Your application is being reviewed by our team"
   - "This usually takes 3-5 business days"

3. **Resume & Cover Letter**
   - Read-only view of what was submitted

4. **Interview Timeline** (when applicable)
   - Shows scheduled interview date/time
   - Meeting link if online
   - Location if in-person

### Example Applicant Workflow:

```typescript
// 1. Applicant submits application
// status = "submitted"

// 2. Applicant checks status after 2 days
// status = "under_review"
// Sees message: "Your application is being reviewed..."

// 3. After 4 days, recruiter shortlists
// status = "shortlisted"
// Applicant sees: "You've been shortlisted! Interview coming soon..."

// 4. Recruiter schedules interview
// status = "interview_scheduled"
// Applicant sees scheduled interview in timeline
// Can click to join video call (if online)

// 5. Interview completed
// status = "interviewed"
// Applicant sees completion confirmation

// 6. Offer sent
// status = "offer_sent"
// Applicant gets notification and can respond
```

## 3. Server Actions - Usage Examples

### Update Application Status

```typescript
// Shortlist a candidate
const formData = new FormData();
formData.append("application_id", "abc-123");
formData.append("status", "shortlisted");
formData.append("hr_notes", "Strong candidate, great fit for the team");

await updateApplicationEvaluation(formData);
```

### Save HR Notes Only

```typescript
// Update notes without changing status
const formData = new FormData();
formData.append("application_id", "abc-123");
formData.append("hr_notes", "Needs to clarify experience with React");

await updateApplicationEvaluation(formData);
```

### Schedule an Interview

```typescript
const formData = new FormData();
formData.append("application_id", "abc-123");
formData.append("scheduled_at", "2024-04-25T14:00:00");
formData.append("interview_type", "online");
formData.append("duration_minutes", "60");
formData.append("timezone", "Asia/Manila");
formData.append("video_room_name", "interview-smith-2024");

await moveToInterview(formData);

// Creates interview record and updates application status
```

### Reject a Candidate

```typescript
await rejectCandidate(
  "abc-123",
  "Didn't meet minimum requirements for experience"
);

// status updated to "rejected"
// hr_notes updated with reason
```

### Send Offer

```typescript
await offerPosition("abc-123");

// status updated to "offer_sent"
// Applicant notified (in future)
```

### Mark as Hired

```typescript
await markAsHired("abc-123");

// status updated to "hired"
// Could trigger employee creation (future)
```

## 4. Component Customization Examples

### Custom Status Colors

```typescript
// In your component, you can override colors:
const customStatusConfig = {
  ...statusConfig,
  shortlisted: "bg-pink-100 text-pink-700", // Custom color
};

// Or pull from APPLICATION_STATUS_COLORS constant:
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
const color = APPLICATION_STATUS_COLORS[application.status];
```

### Conditional Rendering by Role

```typescript
// In ApplicationDetailView:
const isRecruiter = userRole === "hr_manager" || userRole === "admin";

{!isRecruiter && <StatusTracker status={status} interviews={interviews} />}
{isRecruiter && <EvaluationSidebar application={application} />}
```

### Custom Interview Actions

```typescript
// In EvaluationSidebar, you can extend the nextActions array:
const nextActions = [
  { label: "Shortlist", status: "shortlisted", color: "bg-yellow-500" },
  { label: "Reject", status: "rejected", color: "bg-red-500" },
  // Add custom action:
  { label: "Request More Info", status: "under_review", color: "bg-blue-500" },
];
```

## 5. Real-Time Updates Implementation (Future)

```typescript
// Using Supabase real-time subscriptions:
useEffect(() => {
  const subscription = supabase
    .from("applications")
    .on("*", (payload) => {
      if (payload.new.id === applicationId) {
        // Update local state
        setApplicationStatus(payload.new.status);
        setHrNotes(payload.new.hr_notes);
      }
    })
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, [applicationId]);
```

## 6. Email Notification Integration (Future)

```typescript
// After updating status, send email:
async function handleStatusUpdate(newStatus: string) {
  // Update in DB (existing)
  await updateApplicationEvaluation(formData);

  // Send notification email
  await fetch("/api/send-email", {
    method: "POST",
    body: JSON.stringify({
      to: candidate.email,
      template: "application_status_updated",
      variables: {
        candidateName: candidate.first_name,
        jobTitle: job.title,
        newStatus: newStatus,
        actionUrl: `${process.env.NEXT_PUBLIC_URL}/applications/${applicationId}`,
      },
    }),
  });
}
```

## 7. Analytics & Reporting (Future)

```typescript
// Track application progression:
interface ApplicationMetrics {
  totalApplications: number;
  submittedCount: number;
  underReviewCount: number;
  shortlistedCount: number;
  interviewScheduledCount: number;
  hiredCount: number;
  rejectedCount: number;
  avgTimeToShortlist: number; // days
  avgTimeToHire: number; // days
  conversionRate: number; // hired / submitted
}

// Can be displayed in analytics dashboard
```

## 8. Bulk Operations (Future Enhancement)

```typescript
// Update multiple applications at once:
async function bulkUpdateStatus(
  applicationIds: string[],
  newStatus: string
) {
  const promises = applicationIds.map((id) => {
    const formData = new FormData();
    formData.append("application_id", id);
    formData.append("status", newStatus);
    return updateApplicationEvaluation(formData);
  });

  await Promise.all(promises);
}

// Usage:
await bulkUpdateStatus(
  ["id1", "id2", "id3"],
  "shortlisted"
);
```

## 9. Application Comments System (Future)

```typescript
// Extension: Add threaded comments
interface ApplicationComment {
  id: string;
  application_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// Display in a comment section below notes:
<div className="rounded-2xl border border-border bg-surface p-6">
  <h3>Comments & Discussion</h3>
  {comments.map((comment) => (
    <CommentCard key={comment.id} comment={comment} />
  ))}
  <CommentInput onSubmit={handleAddComment} />
</div>
```

## 10. Integration with Existing Pages

### From HR Applications List:
```tsx
// Click on an application row to view details
<Link href={`/applications/${application.id}`}>
  <div className="cursor-pointer hover:bg-gray-50">
    {/* Application preview card */}
  </div>
</Link>

// User is directed to /applications/[id]
// Sees evaluation sidebar since they're HR
```

### From Applicant Applications List:
```tsx
// Click on an application to view status
<Link href={`/applications/${application.id}`}>
  <div className="cursor-pointer hover:bg-gray-50">
    <h4>{job.title}</h4>
    <p>Status: {application.status}</p>
  </div>
</Link>

// User is directed to /applications/[id]
// Sees status tracker since they're applicant
```

## 11. Styling Customization

### Using CSS Variables (if using CSS Module):
```css
.statusBadge {
  @apply px-3 py-1 rounded-full text-sm font-medium;
  background-color: var(--status-bg-color);
  color: var(--status-text-color);
}
```

### Using Tailwind Arbitrary Values:
```tsx
<div className="bg-[#custom-color] border-[#custom-border]">
  {/* Custom styling */}
</div>
```

## Troubleshooting Guide

### Application doesn't show up
- Verify application ID is correct
- Check user has permission to view
- Ensure candidate_id matches current user (for applicants)

### Status doesn't update
- Check server action response in console
- Verify user is HR Manager or Admin
- Ensure application_id is valid

### Resume not displaying
- Check pdf_url is accessible
- Verify Supabase Storage bucket permissions
- Test with text view if PDF fails

### Interview not showing
- Ensure interview has application_id linked
- Check interview scheduled_at date is valid
- Verify interview status is not 'cancelled'

### Permissions error
- User must be logged in
- For updates, must be HR role
- Check role in profiles table
