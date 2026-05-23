# Kayod — Copilot Persistent Instructions

You are working on **Kayod**, an AI-assisted hiring platform.
Before writing any code, read and internalize everything in this file.

---

## 1. What Kayod is

Kayod is a Next.js (App Router) + Supabase hiring platform with three user roles:

| Role | Device | Root route |
|------|--------|------------|
| HR / Admin | Desktop | `/dashboard` |
| Applicant | Mobile PWA | `/apply/*` |
| Employee | Mobile PWA | `/employee/*` |

**Tech stack (do not introduce alternatives without asking):**
- Framework: Next.js App Router
- Auth + DB: Supabase (`@/lib/supabase` — never create a new client)
- Contract signing: DocuSeal
- Interview room: WebRTC (Jitsi has been removed)
- Maps: react-leaflet
- AI scoring: Claude API (hybrid with TF-IDF)
- Styling: Tailwind CSS

---

## 2. The master plan

The full sprint-by-sprint plan lives at `.copilot/kayod-plan-reference.md`.

**You must read `.copilot/kayod-plan-reference.md` before starting any task.**
If you cannot find that file, stop and tell the user: _"I can't find .copilot/kayod-plan-reference.md — please confirm the file exists before we continue."_

---

## 3. Sprint order — never skip ahead

```
Sprint 0  →  Sprint 1  →  Sprint 2  →  Sprint 3 & 4 (parallel)  →  Sprint 5  →  Sprint 6
```

| Sprint | Focus | Status |
|--------|-------|--------|
| 0 | Bug fixes & blockers | 🔴 Do first |
| 1 | Landing page + tenant onboarding | 🔴 Do first |
| 2 | PWA foundation (manifest, bottom nav) | After Sprint 0 |
| 3 | Applicant portal UI | After Sprint 2 |
| 4 | Employee portal UI | After Sprint 2 |
| 5 | Geofencing | After Sprint 4 |
| 6 | Design system + visual pass | Last, after all above |

**Do not start Sprint 6 (design) until all features are functional.**
Design tokens and visual polish are always the last thing.

---

## 4. Rules you must follow on every task

### Before writing a single line of code:
1. Identify which sprint and task number this work belongs to (e.g. "Sprint 0 — Task 2.3")
2. State which files you will modify
3. State what you will NOT touch
4. If the task is ambiguous → follow Rule 5 below (ask, do not assume)

### While coding:
- Never change route structure unless the task explicitly says to
- Never install a new npm package unless the plan specifies it
- Never rewrite a working component to "clean it up" unless that is the task
- All UI must work at **390px viewport** (mobile) and **1280px** (desktop)
- Always use the Supabase client from `@/lib/supabase`
- Match score color coding: ≥75% green · 50–74% amber · <50% red · null gray

### Definition of done (do not say a task is complete until all pass):
- [ ] Works end-to-end in the browser
- [ ] Works at 390px viewport
- [ ] No new console errors
- [ ] Supabase query returns expected data (verify the query, not just the UI)
- [ ] No regressions in previously working features

---

## 5. Clarification rules — when to stop and ask

**Stop and ask the user if ANY of the following are true:**

- The task touches more than 3 files and the plan does not specify all of them
- You are unsure which sprint or section the request belongs to
- The user's request contradicts something in the plan
- You would need to install a package not mentioned in the plan
- You would need to change the database schema beyond what the plan specifies
- The request seems like Sprint 6 (visual polish) but earlier sprints aren't done
- You are about to delete or rewrite existing working logic

**When you ask, use this format:**

```
Before I start, I need to clarify:

1. [Your specific question]
2. [Your specific question]

The plan reference for this task is: [Sprint X — Section Y.Z]
My current understanding is: [your interpretation]
Is that correct, or should I approach this differently?
```

**Do not make assumptions and proceed. Always ask first.**

---

## 6. Task prompt template

When the user gives you a task, internally map it to this structure before responding:

```
Sprint:        [e.g. Sprint 0]
Section:       [e.g. 2.3 — Match score algorithm]
Files affected: [list specific files]
Files NOT touching: [anything adjacent but out of scope]
Acceptance criteria: [from the plan]
Blockers/questions: [anything unclear — ask before proceeding]
```

Show this mapping to the user before writing code, so they can correct you early.

---

## 7. Things that are permanently decided — do not suggest alternatives

| Decision | What was chosen | Do not suggest |
|----------|----------------|----------------|
| Interview room | WebRTC (native) | Jitsi, Daily.co, Whereby, Agora |
| Signaling | Supabase Realtime | Socket.io, Firebase, Ably |
| STUN | stun:stun.google.com:19302 | Any other STUN |
| Maps | react-leaflet | Google Maps, Mapbox |
| Geocoding | Nominatim (free) | Google Geocoding API |
| AI scoring | Claude API hybrid | OpenAI, Gemini |
| Payment (simulated) | Fake checkout (always succeeds) | Stripe, PayMongo |
| Design order | Design is LAST (Sprint 6) | Any earlier visual overhaul |

---

## 8. Multi-tenancy rules

- Every job listing is **public** — all applicants see all company listings
- `tenant_id` is only linked to an applicant when they become an employee
- HR sees only their own company's applicants and listings
- Company logo is stored in Supabase Storage at `/company-logos/{tenant_id}`
- Company logo must be passed to DocuSeal on every contract generation

---

## 9. WebRTC meeting room — key constraints

- Signaling via Supabase Realtime broadcast channel (room_id stored in interviews table)
- No media server — direct peer-to-peer for 1-on-1 interviews
- HR side: floating notepad (draggable, position:fixed, auto-saves to `interviews.hr_notes` every 10s)
- Applicant side: no notepad — mobile-optimized full-screen video only
- Connection states to handle: Connecting · Connected · Poor connection · Disconnected

---

## 10. Match score formula (do not deviate from this)

| Factor | Weight | Method |
|--------|--------|--------|
| Required skills overlap | 40% | TF-IDF first, Claude API fallback for semantic match |
| Job title similarity | 25% | Claude API semantic similarity |
| Years of experience | 15% | Numeric delta vs job.min_experience |
| Education match | 10% | Keyword match on degree level + field |
| Work setup match | 10% | Enum exact match |

- Store sub-scores in `match_scores` table — never just a single total column
- Cache Claude API results per job+applicant pair — never re-call on page load
- Display score on BOTH the applicant list card (HR) AND the applicant detail page

---

*Last updated: May 2026 — Kayod Architecture Plan v2.0*
*Full plan: `.copilot/kayod-plan-reference.md`*