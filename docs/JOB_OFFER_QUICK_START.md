# Job Offer Feature - Quick Start & Configuration

## What's Been Implemented

✅ **Database Schema** - JobOffer and NegotiationRequest tables with RLS policies  
✅ **Server Actions** - All CRUD operations for offers and negotiations  
✅ **Job Offer Page** - Full-featured page at `/job-offer/:offerId`  
✅ **Applicant UI** - Accept, Decline, Negotiate flows  
✅ **HR UI** - Revoke, Download, Respond to negotiations  
✅ **DocuSeal Integration** - Signing form embed and webhook handler  
✅ **Offer Expiry** - Scheduled daily job to mark expired offers  
✅ **Notifications** - Custom routing to job offer pages  
✅ **TypeScript Types** - Full type safety  

## Required Configuration

### 1. Database Migrations

Run these in Supabase SQL Editor:

```bash
# 1. Job Offer Management Tables
supabase/20260506_add_job_offer_management.sql

# 2. Offer Expiry Automation
supabase/20260506_add_offer_expiry_job.sql
```

### 2. Environment Variables

Ensure these are set in `.env.local`:

```env
DOCUSEAL_API_KEY=your_docuseal_api_key
DOCUSEAL_BASE_URL=https://api.docuseal.com
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or production URL
```

### 3. DocuSeal Webhook Configuration

In your DocuSeal dashboard:

1. Go to Webhook Settings
2. Add webhook URL: `{NEXT_PUBLIC_APP_URL}/api/docuseal/offer-webhook`
3. Subscribe to events:
   - `form.completed`
   - `form.declined`

### 4. Install Dependencies

```bash
npm install sonner lucide-react
```

(If not already installed)

## Integration with Application Detail Page

To add "Send Job Offer" button to the application detail page, update the HR evaluation sidebar:

**File**: `app/(dashboard)/applications/[id]/page.tsx` or similar

```tsx
import { useState } from "react";
import { createJobOffer } from "@/app/(dashboard)/job-offers/job-offer-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// In your HR evaluation sidebar component:
export function HREvaluationSidebar({ application, job }: Props) {
  const router = useRouter();
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendOffer = async () => {
    setIsLoading(true);
    try {
      const result = await createJobOffer(application.id, {
        salary: job.salary_max || 0,
        currency: job.currency || "PHP",
        employmentType: job.employment_type || "full-time",
        startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        workArrangement: job.work_setup || "hybrid",
        department: "Engineering", // Get from job posting
        manager: "HR Manager", // Get from HR user
        benefits: ["Health Insurance", "401k Match", "Flexible Hours"],
        notes: "Welcome to our team! We're excited to have you join us."
      }, 7); // 7 day expiry

      if (result.success) {
        toast.success("Offer sent successfully!");
        router.push(`/job-offer/${result.offerId}`);
      } else {
        toast.error(result.error || "Failed to send offer");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ... existing sidebar content ... */}
      
      <button
        onClick={handleSendOffer}
        disabled={isLoading}
        className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300"
      >
        {isLoading ? "Sending..." : "📨 Send Job Offer"}
      </button>
    </div>
  );
}
```

## File Structure

```
app/
├── (dashboard)/
│   ├── job-offer/
│   │   ├── [offerId]/
│   │   │   └── page.tsx          ← Main offer page
│   │   ├── layout.tsx
│   │   └── job-offer-actions.ts  ← All server actions
│   └── ...
├── api/
│   └── docuseal/
│       └── offer-webhook/
│           └── route.ts           ← Webhook handler
└── ...

components/
├── job-offer/
│   ├── job-offer-header.tsx
│   ├── job-offer-terms-panel.tsx
│   ├── job-offer-pdf-panel.tsx
│   ├── applicant-action-panel.tsx
│   ├── negotiation-form.tsx
│   ├── docuseal-embed.tsx
│   ├── hr-action-panel.tsx
│   └── negotiation-response-panel.tsx
└── ...

lib/
├── types.ts                       ← JobOffer, NegotiationRequest types
└── ...

supabase/
├── 20260506_add_job_offer_management.sql
└── 20260506_add_offer_expiry_job.sql

docs/
└── JOB_OFFER_PAGE_IMPLEMENTATION.md
```

## API Endpoints

### Offer Webhook
- **POST** `/api/docuseal/offer-webhook`
- Receives DocuSeal events: `form.completed`, `form.declined`
- No authentication required (DocuSeal webhook)
- Processes signing completions and declines

## Features Summary

### For Applicants
- ✅ View offer details on dedicated page
- ✅ Accept offer → DocuSeal signing form
- ✅ Decline offer (with confirmation)
- ✅ Negotiate terms (up to 3 rounds)
- ✅ See HR responses to negotiations
- ✅ Download signed contract

### For HR
- ✅ Create and send offers from application detail
- ✅ View offer activity timeline
- ✅ Respond to negotiation requests
- ✅ Download signed contracts
- ✅ Revoke offers
- ✅ Track all negotiations and responses

### System Features
- ✅ Offer expiry automation (daily job)
- ✅ Deep-link notifications to offer page
- ✅ DocuSeal PDF generation and signing
- ✅ Webhook integration for completion handling
- ✅ Negotiation round limiting (max 3)
- ✅ Offer versioning on revisions
- ✅ Full audit trail via timestamps

## Testing Checklist

- [ ] Create offer from application detail
- [ ] Applicant receives notification
- [ ] Offer page loads correctly
- [ ] Accept offer → DocuSeal form opens
- [ ] Complete DocuSeal signing
- [ ] Webhook fires → offer marked accepted
- [ ] HR sees signed contract link
- [ ] Try negotiation flow (up to 3 rounds)
- [ ] HR counter-offer → offer version increments
- [ ] Decline offer → notification sent to HR
- [ ] Revoke offer → applicant notified
- [ ] Check expiry job (create offer with past date)
- [ ] Mobile responsiveness on all pages
- [ ] PDF viewer works in iframe

## Troubleshooting

### Webhook not firing
- Check DocuSeal webhook URL in dashboard
- Verify `NEXT_PUBLIC_APP_URL` environment variable
- Check server logs for webhook requests

### DocuSeal form not loading
- Verify `DOCUSEAL_API_KEY` is set
- Check browser console for CORS/security errors
- Ensure template is properly configured

### Notifications not showing
- Check notification RLS policies
- Verify user IDs are correct
- Check Supabase real-time subscriptions

### Expiry job not running
- Verify `pg_cron` extension is enabled
- Check scheduled jobs in Supabase
- Manually run: `SELECT expire_job_offers();`

## Next Phase (Optional)

Future enhancements:
- Offer letter template customization
- Counter-offer with auto-calculated values
- Bulk offer sending
- Offer analytics dashboard
- Email template customization
- Offer comparison tool
- E-signature (instead of DocuSeal)
- Offer history/archive

## Support

For issues or questions:
1. Check `JOB_OFFER_PAGE_IMPLEMENTATION.md` for detailed docs
2. Review server action error messages
3. Check browser console for client-side errors
4. Check Supabase logs for database errors
5. Verify all migrations are applied

---

**Implementation Status**: ✅ Complete and Ready for Testing
