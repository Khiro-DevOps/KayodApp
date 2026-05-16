# Job Offer - Phase 3 & 4 Quick Checklist

## Pre-Flight Checks

- [ ] **Supabase:** Access Supabase dashboard
- [ ] **Environment:** `.env.local` has `DOCUSEAL_API_KEY`, `DOCUSEAL_BASE_URL`, `NEXT_PUBLIC_APP_URL`
- [ ] **Database:** Tables `job_offer_applications` and `negotiation_requests` exist
- [ ] **DocuSeal:** 
  - [ ] Account created and API key obtained
  - [ ] Contract template created and ID noted
  - [ ] Webhook URL configured: `{NEXT_PUBLIC_APP_URL}/api/docuseal/offer-webhook`

## Test Workflow: Complete Offer Lifecycle

### 1. Setup Test Data (5 min)

```bash
1. Log in as HR Manager
2. Go to /jobs/manage
3. Create a test job (if not exists) with:
   - Title: "Software Engineer - Test"
   - Department: Engineering
   - DocuSeal Template ID: [from your DocuSeal account]
   - Publish it
4. Go to /applications
5. Create a test application:
   - Log out → Log in as candidate
   - Go to /jobs
   - Apply to the test job
   - Go back to HR account
```

### 2. HR Sends Offer (3 min)

```bash
1. As HR: Go to /applications
2. Click on test candidate application
3. Scroll to "Send New Offer" section
4. Fill in:
   - Salary: 75000
   - Currency: USD
   - Employment Type: Full-time
   - Start Date: [select 2 weeks from now]
   - Work Arrangement: Hybrid
   - Expiry Days: 7
5. Add Benefits:
   - Health Insurance
   - Dental & Vision
   - 401k Match
6. Click "Send Offer"
7. ✓ Should redirect to /job-offer/{offerId}
8. ✓ Application status should change to "offer_sent"
```

### 3. Candidate Views Offer (2 min)

```bash
1. Log out → Log in as candidate
2. Check notifications (should have "🎉 Job Offer Received!")
3. Click notification or go to /job-offer/{offerId}
4. ✓ Offer should be marked as "viewed"
5. ✓ Should see all terms displayed nicely
6. ✓ Timeline shows: Sent date, Viewed just now
```

### 4. Test Accept & Sign (5 min)

```bash
1. As Candidate: Click "✓ Accept Offer"
2. ✓ Loading indicator appears
3. ✓ DocuSeal signing form appears in iframe
4. In DocuSeal Form:
   - Fill in candidate name
   - Scroll and review all terms
   - Sign the document (draw or upload)
   - Click "Submit"
5. ✓ Form closes
6. ✓ Page reloads
7. ✓ Offer status shows "Accepted"
8. ✓ "Download Signed Contract" button appears
```

### 5. Verify HR See's Changes (2 min)

```bash
1. Switch to HR account (or refresh if different tab)
2. Go to same /job-offer/{offerId}
3. ✓ Offer status shows "Accepted"
4. ✓ Timeline shows: Viewed, Signed dates
5. ✓ "Download Signed Contract" button visible
6. ✓ HR saw notifications:
   - When candidate started signing
   - When candidate completed signing
```

### 6. Verify Application Status (1 min)

```bash
1. Go to /applications
2. Find test candidate
3. ✓ Status should be "hired"
4. ✓ Application shows all checkmarks in pipeline
```

---

## Test Workflow: Negotiation (5 min)

### Setup
- Send offer to candidate (from above test)
- Log in as candidate

### Steps

```bash
1. As Candidate: Go to /job-offer/{offerId}
2. Click "💬 Negotiate" button
3. Add negotiation item:
   - Term: Salary
   - Current Value: 75000
   - Requested Value: 85000
   - Reason: Based on my experience and market rates
4. Click "Submit"
5. ✓ Offer status changes to "negotiating"
6. ✓ Negotiation Round shows "1 of 3"
```

### HR Responds

```bash
1. As HR: Check notification "📋 Negotiation Request Received"
2. Go to /job-offer/{offerId}
3. Scroll to "Negotiation Requests" section
4. ✓ See candidate's request with 85000 counter
5. Choose action:
   - Click "Counter" → Enter 80000 → Submit
6. ✓ Offer status back to "pending"
7. ✓ Candidate notified: "HR has updated your offer"
```

### Candidate Responds to Counter

```bash
1. As Candidate: See offer is pending again
2. Review HR's counter: 80000
3. Accept by clicking "✓ Accept Offer"
4. Complete DocuSeal signing
5. ✓ Offer accepted with final terms
```

---

## Test Workflow: Decline (2 min)

### Setup
- Send fresh offer to candidate

### Steps

```bash
1. As Candidate: Go to /job-offer/{offerId}
2. Click "❌ Decline" button
3. Confirm "Are you sure? This action cannot be undone"
4. Click "Yes, Decline"
5. ✓ Page shows "Offer Declined" message
6. ✓ HR notified: "❌ Offer Declined"
```

---

## Test Workflow: HR Revoke (2 min)

### Setup
- Send fresh offer to candidate (don't let them sign)

### Steps

```bash
1. As HR: Go to /job-offer/{offerId}
2. Scroll to "HR Actions" panel on right
3. Click "🔄 Revoke Offer"
4. ✓ Confirmation appears
5. Click "Yes, Revoke"
6. ✓ Offer status changes to "declined"
7. ✓ Candidate notified: "📋 Offer Withdrawn"
```

---

## Quick Checks After Each Test

- [ ] Server logs show no errors
- [ ] Browser console (F12) shows no errors
- [ ] Notifications are generated correctly
- [ ] Database is updating correctly:
  - Check Supabase console
  - Query: `SELECT id, status, applicant_id FROM job_offer_applications ORDER BY created_at DESC LIMIT 5`
  - Should see updated records

---

## Troubleshooting During Tests

| Problem | Check |
|---------|-------|
| "DocuSeal API error" | API key in .env.local, restart server |
| Signing form won't load | iframe src URL valid, DocuSeal account active |
| Webhook not processing | Check `/api/docuseal/offer-webhook` logs |
| Notification not sent | Check sendNotification function, user ID correct |
| Status not updating | Database RLS policies, connection valid |

---

## Final Verification

After all tests pass:

- [ ] Create a summary of test results
- [ ] Take screenshots of each workflow step
- [ ] Document any bugs or issues
- [ ] Verify all notification types working:
  - [ ] offer_sent (when HR sends)
  - [ ] offer_accepted (when signing starts)
  - [ ] offer_accepted (when signing completes)
  - [ ] offer_declined (when candidate declines)
  - [ ] offer_negotiation_submitted (when candidate negotiates)
  - [ ] offer_negotiation_responded (when HR responds)
- [ ] Test edge cases:
  - [ ] Expired offer (after expiry_days)
  - [ ] Multiple rounds of negotiation
  - [ ] Maximum 3 negotiation rounds enforced

---

## Time Estimate

- Full workflow test: **~30 minutes** (all scenarios)
- Quick sanity check: **~10 minutes** (happy path only)
- Debugging issues: **Varies**

---

## Success Criteria ✅

Phase 3 & 4 are complete when:

1. ✅ HR can send offer with all configurable terms
2. ✅ Offer appears in candidate notifications
3. ✅ Candidate can view offer details
4. ✅ Candidate can accept → DocuSeal form shows → Sign → PDF saved
5. ✅ HR can see signed PDF download
6. ✅ Application status updates to "hired"
7. ✅ Candidate can negotiate (up to 3 rounds)
8. ✅ HR can respond to negotiations
9. ✅ Candidate can decline offer
10. ✅ HR can revoke pending offers
11. ✅ All notifications sent correctly
12. ✅ No console errors
13. ✅ Database state correct for all scenarios
