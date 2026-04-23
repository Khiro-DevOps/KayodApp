# PDF Preview Logic Implementation

## Overview

This implementation provides a complete PDF preview system for the resume builder. Users can click on a resume in the list to open a full-screen modal preview with download functionality.

## Architecture

### Components and Files

#### 1. **Server Action: `actions.ts`**
   - **Function**: `getResumeSignedUrl(resumeId, expiresIn)`
   - **Purpose**: Generates signed URLs for secure PDF access from Supabase Storage
   - **Key Features**:
     - Validates user authentication
     - Verifies resume ownership (candidate_id = auth.uid())
     - Extracts storage path from existing pdf_url or constructs fallback path
     - Returns time-limited signed URL (default: 1 hour)

   ```typescript
   const signedUrl = await getResumeSignedUrl(resumeId, 3600);
   ```

#### 2. **ResumeCard Component** (`resume-card.tsx`)
   - **Type**: Client component
   - **Props**:
     - `resume: Resume` - The resume object
     - `isSelected?: boolean` - Highlights selected resume
     - `onSelect: (resume: Resume) => void` - Click handler
   
   - **Features**:
     - Clickable card with visual feedback
     - Shows resume title and creation date
     - Displays "Primary" badge if applicable
     - Accessible button with proper ARIA labels

#### 3. **ResumePreviewModal Component** (`resume-preview-modal.tsx`)
   - **Type**: Client component
   - **Props**:
     - `resume: Resume | null` - The resume to preview
     - `onClose: () => void` - Close handler
   
   - **Features**:
     - Modal overlay with backdrop blur
     - Loading state with spinner
     - Error handling with fallback options
     - Full-screen iframe PDF viewer
     - Download button with direct link
     - Close button and click-outside-to-close behavior

#### 4. **ResumeListClient Component** (`resume-list-client.tsx`)
   - **Type**: Client component
   - **Props**:
     - `resumes: Resume[]` - Array of user's resumes
   
   - **Responsibilities**:
     - Manages selected resume state
     - Renders list of ResumeCard components
     - Orchestrates ResumePreviewModal visibility
     - Handles empty state

#### 5. **Main Page** (`page.tsx`)
   - Updated to use new `ResumeListClient` component
   - Maintains server-side data fetching
   - Passes resume list to client component

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ page.tsx (Server Component)                              │
│ - Fetches resumes from database                          │
│ - Fetches user profile                                   │
└──────────────────────────┬──────────────────────────────┘
                           │ passes resumes
                           ▼
┌─────────────────────────────────────────────────────────┐
│ ResumeListClient (Client Component)                     │
│ - Manages selectedResume state                           │
│ - Renders resume cards                                   │
│ - Shows/hides preview modal                              │
└──────┬──────────────────┬──────────────────────────────┘
       │                  │
       │ onSelect()       │
       ▼                  ▼
┌──────────────┐  ┌──────────────────────┐
│ ResumeCard   │  │ ResumePreviewModal   │
│ - Clickable  │  │ - Calls getResumeURL │
│ - Highlights │  │ - Shows iframe       │
└──────────────┘  │ - Download link      │
                  └──────────────────────┘
                           │
                           │ getResumeSignedUrl(id)
                           ▼
                  ┌──────────────────────┐
                  │ Server Action: actions.ts
                  │ - Validates auth
                  │ - Gets signed URL
                  │ - Returns to client
                  └──────────────────────┘
```

## State Management

### ResumeListClient State
```typescript
const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
```

This single state variable:
- Tracks which resume is being previewed
- Controls modal visibility (`selectedResume ? show : hide`)
- Passed to ResumePreviewModal and ResumeCard components

### ResumePreviewModal State
```typescript
const [signedUrl, setSignedUrl] = useState<string | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

Manages:
- `signedUrl`: Current preview URL
- `loading`: Fetch progress indicator
- `error`: Error messages for user feedback

## Security Considerations

1. **Authentication**: Server action validates `auth.uid()` before returning signed URL
2. **Authorization**: Database query filters by `candidate_id = user.id`
3. **Time-Limited URLs**: Signed URLs expire after 1 hour (configurable)
4. **Storage Validation**: Verifies file exists in correct bucket before generating URL

## Usage Example

```typescript
// In ResumeListClient:
const handleSelectResume = (resume: Resume) => {
  setSelectedResume(resume);  // Opens modal
};

// User clicks ResumeCard
<ResumeCard 
  resume={resume}
  onSelect={handleSelectResume}
/>

// Modal appears and fetches signed URL automatically
<ResumePreviewModal 
  resume={selectedResume}
  onClose={() => setSelectedResume(null)}
/>
```

## Error Handling

The implementation handles several failure scenarios:

1. **Missing Authentication**: Throws error before fetching
2. **Resume Not Found**: Catches 404 and displays user-friendly message
3. **Permission Denied**: Validates candidate_id before allowing access
4. **URL Generation Failed**: Shows error with fallback to resume.pdf_url
5. **Network Issues**: Loading state prevents duplicate requests

## Performance Optimizations

1. **Lazy Loading**: Signed URL only fetched when modal opens
2. **URL Caching**: Signed URL stored in state, not re-fetched on modal toggles
3. **Effect Dependencies**: useEffect only runs when `resume` changes
4. **No Unnecessary Renders**: Selected state only updates on user click

## Customization Options

### Modify Expiration Time
```typescript
const url = await getResumeSignedUrl(resumeId, 7200); // 2 hours
```

### Change Modal Styling
Edit `resume-preview-modal.tsx` className attributes for custom colors/sizes

### Use Alternative PDF Viewer
Replace iframe with react-pdf or other library:
```typescript
import { Document, Page } from 'react-pdf';

<Document file={signedUrl}>
  <Page pageNumber={1} />
</Document>
```

### Add Preview Size Limit
```typescript
if (resume && resume.pdf_url) {
  const sizeInMB = getFileSizeInMB(resume.pdf_url);
  if (sizeInMB > 10) {
    setError("File too large. Download instead.");
  }
}
```

## Testing Checklist

- [ ] Click resume card → modal opens
- [ ] Modal shows loading state → displays PDF
- [ ] Close button works
- [ ] Click outside modal closes it
- [ ] Download button works
- [ ] Permission denied handled gracefully
- [ ] Multiple resumes can be previewed
- [ ] UI responsive on mobile
- [ ] Keyboard accessibility (Escape to close)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Resume not found" error | Verify resume exists in DB and candidate_id matches |
| PDF won't display in iframe | Check CORS settings in Supabase bucket |
| Signed URL expires | Increase expiresIn parameter or refresh on timeout |
| Modal doesn't open | Check browser console for JavaScript errors |

## Future Enhancements

1. **Add keyboard navigation**: Press Escape to close modal
2. **Add page navigation**: For multi-page PDFs
3. **Add annotation tools**: Allow users to add notes
4. **Add comparison view**: Side-by-side preview of multiple resumes
5. **Add version history**: Show previous resume versions
6. **Add sharing**: Generate shareable links for interviews
