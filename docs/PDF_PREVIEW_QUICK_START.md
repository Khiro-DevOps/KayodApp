# PDF Preview Quick Start

## What Was Implemented

A complete PDF preview system for resumes where users can:
- Click a resume in the "Your Resumes" list
- View a full-screen modal with the PDF
- Download the resume directly
- See loading states and error messages

## File Structure

```
app/(dashboard)/resume/
├── page.tsx                    # Main page (updated to use ResumeListClient)
├── actions.ts                  # Server action for signed URLs (new function added)
├── resume-list-client.tsx      # NEW: Client component managing list + modal state
├── resume-card.tsx             # NEW: Individual clickable resume card
├── resume-preview-modal.tsx    # NEW: Modal with PDF viewer
├── resume-builder-client.tsx   # Existing: Resume creation
├── generate-resume-trigger.tsx # Existing: AI generation trigger
└── resume-upload-client.tsx    # Existing: File upload
```

## Key Functions

### `getResumeSignedUrl(resumeId, expiresIn?)`
Located in `app/(dashboard)/resume/actions.ts`

**Purpose**: Get a secure, time-limited URL from Supabase for PDF access

**Usage**:
```typescript
import { getResumeSignedUrl } from "@/app/(dashboard)/resume/actions";

const url = await getResumeSignedUrl(resumeId);
// Returns: "https://xxx.supabase.co/storage/v1/object/sign/..."
```

**Security**:
- Verifies user is authenticated
- Confirms resume belongs to current user (candidate_id = auth.uid())
- URL expires after 1 hour
- Uses Supabase's built-in signed URL mechanism

## Component Usage

### ResumeListClient
Main orchestrator component - use this in your page:

```typescript
<ResumeListClient resumes={resumes} />
```

**Responsibilities**:
- Manages `selectedResume` state
- Renders resume list with ResumeCard components
- Shows/hides ResumePreviewModal
- Handles modal close

### ResumeCard
Individual resume item in the list:

```typescript
<ResumeCard 
  resume={resume}
  isSelected={selectedResume?.id === resume.id}
  onSelect={setSelectedResume}
/>
```

**Features**:
- Click to select/preview
- Visual highlight when selected
- Shows creation date
- Shows "Primary" badge if applicable

### ResumePreviewModal
Modal with PDF viewer and download:

```typescript
<ResumePreviewModal 
  resume={selectedResume}
  onClose={() => setSelectedResume(null)}
/>
```

**States**:
- `null` resume → hidden
- Loading → shows spinner
- Loaded → shows PDF in iframe
- Error → shows error message + fallback link

## Data Flow (Simplified)

1. **User clicks resume card**
   ```
   ResumeCard.onClick → onSelect(resume)
   ```

2. **Modal opens with loading state**
   ```
   ResumeListClient.selectedResume = resume
   ```

3. **Signed URL fetched server-side**
   ```
   useEffect → getResumeSignedUrl(resume.id) → await supabase
   ```

4. **PDF displays in iframe**
   ```
   signedUrl → <iframe src={signedUrl} />
   ```

## Customization Examples

### Change Modal Size
In `resume-preview-modal.tsx`:
```typescript
// Current: max-w-4xl (56rem)
// Change to:
<div className="... max-w-2xl ...">  // Smaller
<div className="... max-w-full ..."> // Full width
```

### Change Expiration Time
In `resume-list-client.tsx` or where you call it:
```typescript
const url = await getResumeSignedUrl(resume.id, 7200); // 2 hours instead of 1
```

### Add Keyboard Shortcuts
In `resume-preview-modal.tsx`:
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [onClose]);
```

### Use Different PDF Viewer
Replace iframe with react-pdf package:
```typescript
// Install: npm install react-pdf

import { Document, Page } from 'react-pdf';

{signedUrl && (
  <Document file={signedUrl}>
    <Page pageNumber={pageNumber} />
  </Document>
)}
```

## Testing the Feature

### Manual Test Steps
1. Go to `/dashboard/resume`
2. Ensure you have at least one resume
3. Click on a resume in the "Your Resumes" list
4. Modal should open and PDF should load
5. Click "Download PDF" button
6. Verify PDF downloads
7. Click X or outside modal to close

### Common Issues & Fixes

| Problem | Check |
|---------|-------|
| Modal doesn't open | Browser console - any JS errors? |
| PDF shows blank | Is the file actually stored in Supabase? |
| "Resume not found" | Is the resume.id correct? Does user own it? |
| Download doesn't work | Check browser's download folder |

## API Reference

### `getResumeSignedUrl(resumeId, expiresIn?)`

**Parameters**:
- `resumeId` (string, required): The resume ID
- `expiresIn` (number, optional): Seconds until URL expires. Default: 3600

**Returns**:
- Promise<string>: Signed URL

**Throws**:
- "User not authenticated" - No active session
- "Resume not found or access denied" - Resume doesn't exist or doesn't belong to user
- "Failed to get signed URL" - Supabase storage error

**Example**:
```typescript
try {
  const url = await getResumeSignedUrl("resume-123", 7200);
  console.log("URL valid for 2 hours:", url);
} catch (error) {
  console.error("Failed:", error.message);
}
```

## Performance Notes

- **Lazy Loading**: URL only fetched when modal opens
- **Caching**: URL cached in state - no refetch on modal toggle
- **Effect Dependencies**: useEffect only runs when resume changes
- **Memory**: Old signed URLs cleared when new resume selected

## Next Steps

1. Test the feature end-to-end
2. Customize styling to match your design system
3. Add keyboard shortcuts if desired
4. Consider adding search/filter to resume list
5. Add resume metadata (pages, size, generation date)
