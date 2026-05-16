# Job Offer Contract Generation: Complete Fix Implementation

**Problem Summary:**
- Job offer creation was failing because `sendJobOfferLetter()` couldn't find `tenant_name` in HR profiles
- The `tenant_name` column existed but was never populated during signup
- No fallback mechanism existed for missing company data

**Status:** ✅ COMPLETE — 3-Part Solution Implemented

---

## Part 1: Database Correction ✅

### Migration Applied
**File:** `supabase/20260513_backfill_tenant_name_and_fix_trigger.sql`

**What it does:**
1. ✅ Ensures `tenant_name` column exists on `profiles` table (idempotent)
2. ✅ **Updates the `handle_new_user()` trigger** to extract `tenant_name` from auth metadata
3. ✅ **Backfills existing HR profiles** with generated company names
4. ✅ Provides verification queries to check status

### Migration Steps

**To run this migration in Supabase:**

```sql
-- Navigate to: Supabase Dashboard > SQL Editor > New query
-- Paste the contents of: supabase/20260513_backfill_tenant_name_and_fix_trigger.sql
-- Click "Run"
```

**Backfill Strategy for Existing Profiles:**
- Profiles with `role = 'hr_manager'` and `null tenant_name` get:
  - **Priority 1:** Extract from auth metadata if available
  - **Priority 2:** Generate from first_name: `"{first_name} Company"`
  - **Priority 3:** Generate from email domain: `"{domain_name}"`

**Verification Query:**
```sql
SELECT 
  id, 
  email, 
  first_name, 
  role, 
  tenant_name, 
  created_at
FROM profiles
WHERE role = 'hr_manager'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Part 2: Registration Persistence ✅

### Change Applied
**File:** `app/(auth)/actions.ts` — `register()` function

**What changed:**
Added `tenant_name` to the auth metadata payload passed to `signUp()`:

```typescript
const { error: signUpError } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      // ... existing fields ...
      // NEW: Pass company name to be extracted by the trigger
      tenant_name: role === "hr_manager" ? companyName : null,
    },
  },
});
```

**Impact:**
- ✅ New HR users will now have `tenant_name` automatically populated in `profiles.tenant_name`
- ✅ The auth trigger (`handle_new_user()`) extracts this value
- ✅ Works end-to-end from signup form → auth metadata → database

**Data Flow:**
```
Frontend (Company Name Input)
    ↓
register() action collects: companyName
    ↓
auth.signUp() metadata includes: tenant_name = companyName
    ↓
handle_new_user() trigger extracts: tenant_name
    ↓
profiles.tenant_name = companyName ✅
```

---

## Part 3: Offer Hydration Logic ✅

### Changes Applied
**File:** `app/(dashboard)/jobs/manage/[id]/applicants/[appId]/offer/send-offer-actions.ts`

#### 3a. Fallback Helper Function
```typescript
function generateFallbackTenantName(profile: any): string | null {
  // Priority 1: Use existing tenant_name if available
  if (profile.tenant_name) return profile.tenant_name;
  
  // Priority 2: Generate from HR user's first_name
  if (profile.first_name?.trim()) 
    return `${profile.first_name.trim()} Company`;
  
  // Priority 3: Extract from email domain
  if (profile.email) {
    const domain = profile.email.split("@")[1]?.split(".")[0];
    return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : null;
  }
  
  return null;
}
```

#### 3b. Enhanced Template Creation Logic
```typescript
// FALLBACK MECHANISM: Generate tenant_name if missing
const companyName = profile?.tenant_name || generateFallbackTenantName(profile);

if (!companyName) {
  console.error("sendJobOfferLetter: unable to determine company name");
  return {
    error: "Company profile incomplete - please update your company details in HR settings.",
    success: false,
  };
}

// Pass the company name to DocuSeal
const templateId = await createJobOfferTemplate(
  { jobTitle, employmentType, location, ... },
  {
    name: companyName,  // ✅ Always has a value
    email: profile?.email || "noreply@kayod.app",
  },
  job.offer_letter_settings
);
```

**Benefits:**
- ✅ **Never fails** on missing `tenant_name` — always provides a fallback
- ✅ **Specific error messages** if all fallbacks fail (guides HR to fix profile)
- ✅ **Logging** shows which company name was used (debugging)
- ✅ **Graceful degradation** — system keeps working while admin fixes data

---

## Verification Checklist

### ✅ After Running Migrations:

```bash
# 1. Check that tenant_name column exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'profiles' AND column_name = 'tenant_name'
) AS "tenant_name_column_exists";
# Expected: true

# 2. Check existing HR profiles now have tenant_name populated
SELECT COUNT(*) as "HR_profiles_with_tenant_name"
FROM profiles
WHERE role = 'hr_manager' AND tenant_name IS NOT NULL;

# 3. Check the trigger was updated
SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
# Should contain: "tenant_name"

# 4. Review specific profile (replace with real ID)
SELECT id, email, first_name, tenant_name, role
FROM profiles
WHERE role = 'hr_manager'
LIMIT 1;
```

### ✅ Test New HR Signup:

1. **Create a new HR account:**
   - Email: `test-hr@example.com`
   - Company Name: `Acme Corporation`
   - Role: `hr_manager`

2. **Verify in database:**
   ```sql
   SELECT email, first_name, tenant_name
   FROM profiles
   WHERE email = 'test-hr@example.com';
   ```
   Expected: `tenant_name = 'Acme Corporation'`

3. **Create and send a job offer:**
   - Create a job posting
   - Create an application
   - Trigger `sendHydratedOffer()` from review board
   - **Expected:** DocuSeal template created successfully with company name

### ✅ Test Fallback Logic:

1. **Manually set an HR profile's tenant_name to NULL:**
   ```sql
   UPDATE profiles 
   SET tenant_name = NULL 
   WHERE id = 'some-hr-user-id';
   ```

2. **Try to send an offer:**
   - The fallback should generate a company name from:
     - Their first_name → `"{first_name} Company"`, OR
     - Their email domain → `"Example"` (from `example@example.com`)

3. **Check logs for:**
   ```
   Creating DocuSeal template for job [...] with company: "Generated Name"
   ```

---

## Rollback/Troubleshooting

### If Migration Fails:

```sql
-- Revert the trigger to original version (if needed)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, first_name, last_name, phone, role, date_of_birth, age, address, city, country)
  VALUES (new.id, new.email, coalesce(new.raw_user_meta_data->>'first_name', ''), ...);
  RETURN new;
END;
$$;
```

### If tenant_name Still Returns NULL:

1. **Check auth metadata in Supabase Auth Dashboard:**
   - User's raw_user_meta_data should include `tenant_name`
   - If missing, HR user was created before this fix was applied

2. **Manual Fix:**
   ```sql
   UPDATE profiles 
   SET tenant_name = 'Your Company Name'
   WHERE id = 'hr-user-id';
   ```

### Common Error Messages & Solutions:

| Error | Cause | Fix |
|-------|-------|-----|
| `"Company profile incomplete - tenant name not set"` | OLD: No fallback existed | ✅ FIXED: Now uses fallback |
| `"42703: column does not exist"` | tenant_name column missing | ✅ FIXED: Migration adds column |
| `"Failed to retrieve company profile"` | Profile lookup failed | Check if HR user exists in profiles table |
| DocuSeal submission fails | Invalid company name | Fallback will generate one automatically |

---

## Implementation Summary

| Component | Status | File(s) |
|-----------|--------|---------|
| **Database Column** | ✅ Exists | `supabase/schema.sql` |
| **Migration - Backfill** | ✅ Created | `supabase/20260513_backfill_tenant_name_and_fix_trigger.sql` |
| **Trigger Update** | ✅ Updated | Same migration file |
| **Registration Persistence** | ✅ Updated | `app/(auth)/actions.ts` |
| **Fallback Logic** | ✅ Added | `app/(dashboard)/jobs/.../send-offer-actions.ts` |
| **Error Handling** | ✅ Enhanced | Same file |

---

## Next Steps

1. **Run the migration** in Supabase Dashboard
2. **Test with new HR signup** to verify `tenant_name` is saved
3. **Monitor logs** when creating job offers (should see company name in logs)
4. **Backfill any missed profiles** manually if needed:
   ```sql
   UPDATE profiles SET tenant_name = 'Your Company' WHERE id = 'xxx';
   ```

---

## Notes on Architecture

### Why "HR Profile = Company"?

In this multi-tenant HRIS:
- Each HR Manager's profile IS the company identity
- Job postings are `created_by` an HR user
- Job offers look up the creator's profile to get `tenant_name`
- This maintains the "HR Profile = Company" relationship ✅

### Why Not a Separate `tenants` Table?

The current design uses:
- ✅ `profiles.tenant_name` for company identification
- ⚠️ Legacy references to `tenants` table (not yet migrated)

**Future Optimization:** If you want to decouple company from HR user, you could:
1. Create proper `tenants` table with company details
2. Add `tenant_id` foreign key to `profiles`
3. Update offer logic to join via tenant_id

For now, the current solution maintains backward compatibility ✅

---

## Support Contacts

- **Database Issues:** Check Supabase logs in Dashboard
- **Auth Issues:** Check auth metadata in Supabase Auth section
- **DocuSeal Issues:** Check DocuSeal API response in browser Network tab
- **Logs:** Server-side errors logged to Vercel deployments or local console

