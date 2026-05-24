# Kayod — Full Sprint Plan Reference
> This file is referenced by `.github/copilot-instructions.md`.
> Copilot should read this before starting any task.

---

## Sprint 0 — Bug fixes & blockers
**Ship this before anything else. ~2 days.**

> **Note:** The invisible confirm/submit buttons on the HR interviews page have been removed from this sprint.
> That entire page is being rebuilt as part of Task 0.3 (WebRTC replacement) — the bug will be gone when the new room UI replaces it. No separate fix needed.

---

### Task 0.1 — Match score not displayed on HR applicant views
**Priority:** CRITICAL

**Problem:** Match score is computed but does not appear on:
- The HR applicant list card
- The HR applicant detail page

**Fix steps:**
1. Check the Supabase query for the applicant list — confirm `match_score` (or `match_scores` table join) is included in the SELECT
2. Add a score badge to the applicant list card component: `"{score}% match"`
3. Add a score section to the applicant detail page showing total score + sub-scores per factor
4. If score is null: show `"Calculating..."` gray badge and trigger recomputation

**Color coding (applies everywhere scores appear):**
- ≥75% → green badge
- 50–74% → amber badge
- <50% → red badge
- null → gray "Calculating..." badge

**Acceptance criteria:**
- Score badge visible on applicant list card (HR)
- Score breakdown visible on applicant detail page (HR)
- Score badge visible on job listing cards (Applicant side — `/apply/jobs`)
- Color coding matches the spec above

---

### Task 0.2 — Match score algorithm replacement
**Priority:** CRITICAL

**Problem:** Current algorithm is inaccurate. Replace with the weighted hybrid formula.

**Formula:**

| Factor | Weight | Method |
|--------|--------|--------|
| Required skills overlap | 40% | TF-IDF keyword overlap first. If overlap confidence < 80%, call Claude API for semantic resolution. Cache result per job_id+applicant_id. |
| Job title / role similarity | 25% | Claude API — compare job title text to resume headline and experience titles |
| Years of experience | 15% | Numeric delta: `job.min_experience` vs `resume.total_years_experience`. Full score if within range, decays linearly outside. |
| Education match | 10% | Keyword match: degree level (bachelor/master/etc) + field. Exact = 100%, related field = 60%, no match = 0%. |
| Work setup match | 10% | Enum exact match: `job.work_setup` vs `applicant.preferred_setup`. Match = 100%, mismatch = 0%. |

**Output:** Integer 0–100

**Implementation requirements:**
- Run as a Next.js API route (`/api/compute-match-score`) or Supabase Edge Function — never block the UI
- New `match_scores` table schema:
  ```sql
  id              uuid primary key
  applicant_id    uuid references profiles(id)
  job_id          uuid references jobs(id)
  score_total     int (0-100)
  score_skills    int
  score_title     int
  score_experience int
  score_education  int
  score_setup     int
  reasons         text[]   -- audit log: why the score is high/low
  computed_at     timestamptz
  ```
- Cache Claude API results — same job+applicant pair should never re-call Claude on page load
- Trigger recomputation when: applicant updates resume, HR edits job requirements

**Acceptance criteria:**
- Score for a test applicant with matching skills is ≥75
- Score for a test applicant with no matching skills is <30
- Sub-scores are individually visible on the HR detail page
- Claude API is not called on every page load (check network tab)

---

### Task 0.3 — Replace Jitsi with WebRTC
**Priority:** HIGH

**Problem:** Jitsi iframe is not mobile-compatible, does not allow floating notepad, and can't be controlled.

**Architecture:**
- Signaling: Supabase Realtime broadcast channel. Channel name = `interview-room-{room_id}`
- STUN: `stun:stun.google.com:19302` (free, no setup)
- TURN: Cloudflare TURN free tier — required for users behind strict NAT
- 1-on-1 only — no media server needed (direct RTCPeerConnection)

**Connection flow:**
1. HR opens `/dashboard/interviews/[id]/room` → generates `room_id` (uuid), stores in `interviews.room_id`
2. HR side creates RTCPeerConnection, creates SDP offer, publishes to Supabase channel
3. Applicant opens room link → joins Supabase channel, receives offer, creates answer, publishes answer
4. Both sides exchange ICE candidates via the same channel
5. Peer connection established — stream video/audio

**HR UI layout (desktop):**
- Left panel (70%): remote video (applicant)
- Right panel (30%): local video (HR) small + floating notepad below
- Bottom bar: mute, camera toggle, end call

**Applicant UI layout (mobile, PWA):**
- Full-screen remote video
- Local video small overlay (top-right corner, 120×90px)
- Bottom bar: mute, camera toggle, end call (44px minimum tap targets)
- No notepad on applicant side

**Floating notepad (HR only):**
- `position: fixed`, bottom-right, draggable (use mouse events or a lightweight drag hook)
- Collapses to a pencil icon button when minimized
- Auto-saves `note content` to `interviews.hr_notes` via Supabase every 10 seconds
- Also saves on `beforeunload`
- Pre-populates from `interviews.hr_notes` on room open (persist across sessions)

**Connection status indicator (both sides):**
- Connecting… → Connected → Poor connection (if ICE fails) → Disconnected

**Schema additions to `interviews` table:**
```sql
room_id         uuid        -- Supabase Realtime channel identifier
hr_notes        text        -- floating notepad content
webrtc_started_at  timestamptz
webrtc_ended_at    timestamptz
```

**Acceptance criteria:**
- HR and applicant can connect in the same browser (two tabs as test)
- Video and audio stream both directions
- Floating notepad saves to Supabase and persists on page reload
- Mobile layout works at 390px without horizontal scroll
- End call button disconnects both peers and closes streams

---

## Sprint 1 — Landing page, subscription & tenant onboarding
**~4–5 days. Can run parallel to Sprint 0.**

---

### Task 1.1 — Public landing page `/`
**No auth required to view.**

**Sections:**
1. **Hero:** Headline, subheadline. Two CTAs: "I'm hiring" → `/register` and "Find a job" → `/apply/jobs`
2. **Features:** 3–4 cards with icons. AI screening, contract signing, mobile portal, time tracking.
3. **Pricing:** 3-column table. Each plan has "Get started" → `/register?plan={tier}`
4. **Footer:** `/login`, `/register`, support placeholder

**Acceptance criteria:**
- Page renders without auth
- Both CTAs navigate to correct routes
- Plan param is passed correctly to `/register`
- Mobile-responsive at 390px

---

### Task 1.2 — Subscription tiers

| Tier | Simulated price | Limits | Features |
|------|----------------|--------|----------|
| Starter | PHP 999/mo | 5 listings, 50 applicants/mo | Pipeline, DocuSeal, applicant portal |
| Growth | PHP 2,499/mo | 20 listings, 300 applicants/mo | + AI scoring, AI resume parsing, analytics |
| Enterprise | PHP 5,999/mo | Unlimited | + priority support, custom contract templates, employee portal |

**Schema addition to `companies` table:**
```sql
logo_url        text        -- Supabase Storage: /company-logos/{id}
plan            enum: starter | growth | enterprise
plan_expires_at timestamptz
```

---

### Task 1.3 — HR tenant registration `/register`

**4-step form:**

**Step 1 — Company info:**
- Company name (required)
- Company logo upload (PNG/JPG ≤2MB) → Supabase Storage `/company-logos/{uuid}` → show preview
- HR admin full name, email, password, confirm password

**Step 2 — Plan selector:**
- Show pricing table, highlight pre-selected plan from `?plan=` param

**Step 3 — Simulated payment:**
- Card number (any 16 digits), expiry MM/YY, CVV, cardholder name
- "Pay now" → 1.5s loading state → always succeeds
- On success: write `plan` and `plan_expires_at = now() + 30 days` to Supabase
- No real payment gateway called

**Step 4 — Success screen:**
- Confirm company name and plan
- Redirect to `/dashboard` after 3 seconds

**Acceptance criteria:**
- Full flow works start to finish
- Logo uploads to Supabase Storage and URL is saved to `companies.logo_url`
- Plan and expiry are written to DB correctly
- Redirect to `/dashboard` after success

---

### Task 1.4 — Company logo → DocuSeal contract

**When generating an offer letter:**
1. Fetch `companies.logo_url` for the current tenant
2. Include it as `company_logo_url` variable in the DocuSeal API create-document payload
3. DocuSeal template must have an image field mapped to this variable

**Acceptance criteria:**
- Generated contract PDF shows the company logo
- No logo breakage when `logo_url` is null (show placeholder or skip gracefully)

---

## Sprint 2 — PWA foundation
**~2–3 days. Start after Sprint 0.**

---

### Task 2.1 — manifest.json

Create `/public/manifest.json`:
```json
{
  "name": "Kayod",
  "short_name": "Kayod",
  "start_url": "/login",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#1D9E75",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Reference in `app/layout.tsx` metadata export.

---

### Task 2.2 — Meta tags

Add to `app/layout.tsx`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

---

### Task 2.3 — Conditional bottom navigation

In root layout or `ClientLayout`:
- `pathname.startsWith('/apply')` → render `<ApplicantBottomNav>`
- `pathname.startsWith('/employee')` → render `<EmployeeBottomNav>`
- All other routes → nothing

**ApplicantBottomNav tabs:** Home · Jobs · Track · Resume AI · Profile
**EmployeeBottomNav tabs:** Home · Schedule · Payslips · Updates · Profile

**Requirements:**
- `position: fixed; bottom: 0; width: 100%`
- `padding-bottom: env(safe-area-inset-bottom)`
- All tap targets ≥44×44px
- Active tab uses brand color (`#1D9E75`)
- All `/apply` and `/employee` pages have `padding-bottom: ~5rem` to clear the nav

---

### Task 2.4 — 390px viewport audit

- Test every `/apply/*` and `/employee/*` page at 390px
- Fix any `overflow-x` / horizontal scroll
- Confirm no interactive element is smaller than 44×44px

---

## Sprint 3 — Applicant portal UI
**~4–5 days. After Sprint 2.**

| Route | Page | Notes |
|-------|------|-------|
| `/apply/dashboard` | Home / analytics | Stats cards: applications sent, interviews, offers |
| `/apply/jobs` | Job listings | Match score badge per card. Filter: role, location, setup. One-tap apply. |
| `/apply/applications` | Application tracker | Pipeline card list with status pills |
| `/apply/applications/[id]` | Application detail | Status timeline. Interview info nested here. |
| `/apply/applications/[id]/offer` | Offer letter | Full-screen DocuSeal embed |
| `/apply/resume` | AI resume generator | Claude API for generation |
| `/apply/profile` | Profile + settings | Preferred work setup, logout |

---

## Sprint 4 — Employee portal UI
**~3–4 days. After Sprint 2. Parallel to Sprint 3.**

| Route | Page | Notes |
|-------|------|-------|
| `/employee/dashboard` | Home | Stats, recent attendance, shortcuts |
| `/employee/schedule` | Schedule tab | Calendar + clock in/out placeholder |
| `/employee/schedule?tab=leaves` | Leave requests | File and track leaves — tab in same page |
| `/employee/payslips` | Payslips | Monthly cards, download PDF |
| `/employee/announcements` | Announcements | Pinned posts at top |
| `/employee/profile` | Profile + settings | Home address input — REQUIRED before Sprint 5 |

**Address input in `/employee/profile` must be complete before Sprint 5 starts.**

---

## Sprint 5 — Geofencing & time in/out
**~3–4 days. After Sprint 4 (needs employee Profile page).**

---

### Task 5.1 — DB schema

Add to `profiles` (or new `employee_settings` table):
```sql
work_address    text        -- human-readable, entered by employee
work_lat        float8      -- geocoded by Nominatim on address save
work_lng        float8      -- geocoded by Nominatim on address save
work_radius_m   int4 default 100
work_setup      enum: on_site | hybrid | remote  default on_site
```

New `attendance` table:
```sql
id              uuid primary key
employee_id     uuid references profiles(id)
clock_in        timestamptz
clock_out       timestamptz nullable
clock_in_lat    float8
clock_in_lng    float8
clock_out_lat   float8 nullable
clock_out_lng   float8 nullable
within_zone     boolean   -- computed at clock-in, false = flagged
```

---

### Task 5.2 — Address geocoding

- Call Nominatim ONLY when employee saves/updates address in Profile:
  `https://nominatim.openstreetmap.org/search?q={address}&format=json&limit=1`
- Store `lat` and `lng` to DB — never re-geocode on clock-in
- If geocoding returns no result: show error asking for more specific address

---

### Task 5.3 — Haversine utility

Create `lib/haversine.ts` — returns distance in meters between two lat/lng points.
Used in clock-in check: `if distance > work_radius_m → block clock-in`.

---

### Task 5.4 — Clock-in UI states

| State | Trigger | UI |
|-------|---------|-----|
| Not yet requested | First tap of Clock In | Call `navigator.geolocation.getCurrentPosition()`, show loading |
| Inside zone (on-site/hybrid) | Granted + distance ≤ radius | Green indicator, Clock In active, record attendance |
| Outside zone (on-site/hybrid) | Granted + distance > radius | Red indicator, button disabled, show Leaflet map |
| Permission denied | Browser geo blocked | Explain, link to browser/OS location settings |
| Remote employee | `work_setup = 'remote'` | Skip all geo logic, plain Clock In button |

---

### Task 5.5 — Leaflet map (outside-zone feedback)

Install: `npm install react-leaflet leaflet`
Wrap in `dynamic(() => import(...), { ssr: false })` for Next.js.

Map shows:
- Center: `work_lat`, `work_lng` (registered address)
- Circle overlay: radius = `work_radius_m`. Green stroke = inside, red = outside.
- Marker: employee's current live GPS position
- Only visible when employee is OUTSIDE the zone

---

## Sprint 6 — Design system & visual pass
**~5–7 days. LAST sprint. Do not start until all other sprints are done.**

---

### Task 6.1 — Design tokens

Define as CSS custom properties (extend Tailwind theme):

```css
--color-brand:         #1D9E75
--color-brand-light:   #E1F5EE
--color-text-primary:  #111827
--color-text-secondary: #6B7280
--color-border:        #E5E7EB
--color-surface:       #F9FAFB
--color-card:          #FFFFFF
--radius-sm:           6px
--radius-md:           10px
--radius-lg:           16px
--shadow-card:         0 1px 3px rgba(0,0,0,0.08)
```

---

### Task 6.2 — Component standardization pass

Standardize (do not rewrite from scratch — refactor to use tokens):
- `StatusPill` — pipeline stage → label + color
- `ScoreBadge` — match score with green/amber/red/gray
- `JobCard` — used in `/apply/jobs` and HR job management
- `ApplicationCard` — used in `/apply/applications`
- `StatCard` — both dashboard pages
- `BottomSheet` — mobile modal, slides up, drag handle
- `PageHeader` — title + back button for inner pages
- `EmptyState` — illustration + message
- `SkeletonLoader` — placeholder while fetching

---

### Task 6.3 — Visual sweep order

Apply in this order:
1. HR portal (`/dashboard`, `/jobs/manage`, `/applicants`, `/interviews`, `/employees`)
2. Applicant portal (all `/apply/*` routes)
3. Employee portal (all `/employee/*` routes)

Per page: consistent padding, correct type scale, brand color on interactive elements, loading states, empty states.

---

### Task 6.4 — Microinteractions

- Button loading state: spinner + disabled on all form submits
- Toast notifications for all CRUD success/error
- Page transitions: CSS fade-in on route change
- Form validation: inline error messages, red border on invalid field
- Optimistic UI updates where Supabase latency is noticeable

---

## Open questions (ask the user before proceeding if these are relevant)

1. **Hybrid schedule geofence days** — which days require on-site? Who sets this — HR per employee or company-wide rule?
2. **Clock-out geofencing** — validate location on clock-out too, or only clock-in?
3. **Geofence radius** — is `work_radius_m` set per employee (by HR) or is it one company-wide value?

---

*Kayod Architecture Plan v2.0 — May 2026*