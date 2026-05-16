# Corrected Job Offer Tenant Architecture

## Problem Identified
- ❌ Initial solution used `tenant_name` text field (denormalized)
- ❌ Code tried to use a tenants table that existed but wasn't being properly linked
- ✅ **Proper solution:** Use existing `tenants` table with FK from profiles

---

## Corrected Architecture

```
PUBLIC.TENANTS Table
├── id (uuid, PK)
├── name (text) — Company name
└── created_at (timestamptz)

PROFILES Table (HR Users)
├── id (uuid, FK to auth.users)
├── email, first_name, last_name
├── role = 'hr_manager'
├── tenant_id (uuid, FK → tenants.id) ← NEW
└── ... other fields

JOB_POSTINGS Table
├── id (uuid, PK)
├── created_by (uuid, FK → profiles.id)
├── title, description, etc.
└── ... other fields

JOB_OFFERS / SENDHYDRATEDOFFER
├── Lookup: job.created_by → profile.id
├── Fetch: profile.tenant_id
├── Join: tenant_id → tenants.name ✅
└── Pass company name to DocuSeal
```

---

## Data Flow

### HR Registration
```
Frontend (Company Name Input)
    ↓
register() action receives: companyName
    ↓
Create: INSERT INTO tenants (name) → gets tenant.id
    ↓
Auth.signUp() metadata includes: tenant_id = tenant.id
    ↓
Database trigger handle_new_user() extracts: tenant_id
    ↓
INSERT INTO profiles (..., tenant_id) ✅
```

### Job Offer Creation
```
sendHydratedOffer(jobId, appId)
    ↓
Fetch: job.created_by (HR user ID)
    ↓
SELECT profile, tenants 
  FROM profiles p
  LEFT JOIN tenants t ON p.tenant_id = t.id
  WHERE p.id = job.created_by
    ↓
Get: t.name (company name)
    ↓
Pass to DocuSeal template creation ✅
```

---

## Files Changed

### 1. Database Migration
**File:** `supabase/20260513_backfill_tenant_name_and_fix_trigger.sql`

**Changes:**
- ❌ Remove `tenant_name` column (not needed)
- ✅ Add `tenant_id uuid FK` to profiles
- ✅ Update `handle_new_user()` trigger to extract `tenant_id`
- ✅ Backfill existing HR profiles from auth metadata

### 2. Registration Logic
**File:** `app/(auth)/actions.ts` → `register()` function

**Changes:**
- ✅ Create tenants record: `INSERT INTO tenants (name)`
- ✅ Get `tenant.id` from response
- ✅ Pass `tenant_id` in auth metadata to trigger
- ✅ Trigger extracts and saves to `profiles.tenant_id`

### 3. Offer Hydration Logic
**File:** `app/(dashboard)/jobs/.../send-offer-actions.ts`

**Changes:**
- ❌ Remove fallback helper (not needed now)
- ✅ Join profiles to tenants: `.select("id, email, ..., tenants(id, name)")`
- ✅ Extract company name from `tenants.name` via FK
- ✅ Pass to DocuSeal

### 4. Types
**File:** `lib/types.ts` → Profile interface

**Changes:**
- ❌ Remove: `tenant_name?: string | null`
- ✅ Add: `tenant_id?: string | null`

---

## No More Redundancy ✅

### Before (Broken)
```
Redundancy:
- profiles.tenant_name (text) ← denormalized, could go out of sync
- tenants.name (text) ← canonical
- Code tried to use both inconsistently
```

### After (Fixed)
```
Single Source of Truth:
- tenants.name (canonical) ✅
- profiles.tenant_id (FK reference) ✅
- No denormalized data
```

---

## Verification Queries

```sql
-- 1. Check profile is linked to tenant
SELECT 
  p.id, p.email, p.first_name, p.role, 
  p.tenant_id, t.name as company_name
FROM profiles p
LEFT JOIN tenants t ON p.tenant_id = t.id
WHERE p.role = 'hr_manager'
LIMIT 10;

-- 2. Test the full join (what offer code does)
SELECT 
  p.id, p.email, p.first_name,
  (p.tenants->>'name') as company_name  -- via select
FROM profiles p
WHERE p.role = 'hr_manager'
LIMIT 5;

-- 3. Count HR users with valid tenant links
SELECT COUNT(*) as hr_with_company
FROM profiles p
WHERE p.role = 'hr_manager' 
  AND p.tenant_id IS NOT NULL;
```

---

## Deployment Steps

1. **Run the migration** in Supabase Dashboard:
   - Copy contents of `supabase/20260513_backfill_tenant_name_and_fix_trigger.sql`
   - Paste into SQL Editor > Run

2. **Deploy code changes:**
   - `app/(auth)/actions.ts`
   - `app/(dashboard)/jobs/.../send-offer-actions.ts`
   - `lib/types.ts`

3. **Test new HR signup:**
   - Create account with company name
   - Verify: `SELECT * FROM profiles WHERE email = 'test@example.com'` shows `tenant_id`
   - Verify: Join to tenants shows company name

4. **Test job offer creation:**
   - Create job posting
   - Create application
   - Send offer
   - Check logs for: `"Creating DocuSeal template for job [...] with company: \"Company Name\""`

---

## Architecture Benefits

- ✅ **No redundancy** — Single source of truth (tenants table)
- ✅ **Proper normalization** — FK relationship enforces referential integrity
- ✅ **Clean joins** — Standard SQL pattern for multi-tenant systems
- ✅ **Scalable** — Easy to add company metadata later (address, logo, tax ID, etc.)
- ✅ **Maintains "HR Profile = Company"** — HR user's tenant_id identifies their company

---

## Notes

- Company name now stored in `tenants.name` (not profiles)
- Each HR user has a `tenant_id` pointing to their company
- Job postings inherit the company via creator's profile
- DocuSeal gets company name via: `job.created_by → profile.tenant_id → tenants.name`

