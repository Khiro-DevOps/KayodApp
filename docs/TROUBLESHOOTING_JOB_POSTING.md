# Job Posting System — Troubleshooting Guide

**Date:** April 12, 2026

## Issues You're Experiencing

1. **Redirected to dashboard when accessing `/jobs/manage`**
2. **Jobs aren't being saved when created**
3. **Jobs counter always shows 0**

## Root Causes Fixed

✅ **Bug Fixed in `actions.ts`:** 
- `verifyHR()` function was receiving wrong parameter type
- Now directly checks profile role from database

✅ **Enhanced Error Logging:**
- Added console logs to track job creation process
- Better error messages when jobs fail to save

✅ **Added Missing Defaults:**
- Jobs now explicitly set `is_published: false` and `slots: 1`

## Step-by-Step Debugging

### 1. Verify Your User Role in Database

Open **Supabase Dashboard** → **SQL Editor** → **New Query**:

```sql
-- Check your user profile
SELECT id, email, role, first_name, last_name 
FROM profiles 
WHERE email = 'your-email@example.com';
```

**Expected Result:**
- `email`: Your email
- `role`: Should be `hr_manager` or `admin` (NOT `candidate`)
- `first_name`, `last_name`: Your names

**If role is `candidate`:**
```sql
-- Update your role to HR Manager
UPDATE profiles 
SET role = 'hr_manager' 
WHERE email = 'your-email@example.com';
```

### 2. Verify Job Posting Table Exists

```sql
-- Check if job_postings table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'job_postings' 
AND table_schema = 'public';
```

**Expected Result:** Should return `public | job_postings`

**If no result:**
- Re-run the entire `supabase/schema.sql` in Supabase SQL Editor
- Follow the DATABASE_SETUP.md guide

### 3. Test Job Creation Manually

```sql
-- Manually insert a test job (replace user_id with actual ID)
INSERT INTO job_postings (
  created_by, 
  title, 
  description, 
  industry,
  location,
  is_published,
  slots
) VALUES (
  'user-id-from-step-1',
  'Test Job',
  'This is a test job',
  'IT',
  'Manila',
  false,
  1
);

-- Then verify it was created
SELECT id, title, created_by, is_published 
FROM job_postings 
WHERE title = 'Test Job'
LIMIT 1;
```

### 4. Check Browser Console for Errors

When you try to create a job:

1. Open browser **Developer Tools** (F12)
2. Go to **Console** tab
3. Look for error messages
4. Create a new job in your app
5. Look for logs like:
   - `"Creating job with:"` ← Shows the data being sent
   - `"Job creation error:"` ← If insert failed
   - `"Job created successfully:"` ← If succeeded

## Setup Checklist

Before testing again, verify:

- [ ] You created account with role = **"HR Manager"** (not "Job Seeker")
- [ ] Your profile in database shows role = `hr_manager`
- [ ] Database schema was fully run (all tables exist)
- [ ] You can see `/jobs/manage` page (no redirect)
- [ ] Browser console shows no TypeScript errors

## Quick Fix Process

### If Still Getting Redirected to Dashboard

1. Check your role in database:
   ```sql
   SELECT role FROM profiles WHERE email = 'your-email@example.com';
   ```

2. If it's `candidate`, update it:
   ```sql
   UPDATE profiles SET role = 'hr_manager' WHERE email = 'your-email@example.com';
   ```

3. Clear browser cache and refresh (Ctrl+Shift+Delete)

4. Try accessing `/jobs/manage` again

### If Jobs Aren't Saving

1. Open browser console (F12)
2. Fill out the job form
3. Click "Create Job"
4. Look for error message in console
5. Share the error with me

## Next Steps

Once you can:
1. ✅ Access `/jobs/manage` without redirect
2. ✅ See "No job postings yet" message
3. ✅ Create a job (no error in console)

Then:
1. Go to `/jobs/manage`
2. Click on the created job
3. Toggle "Published" to ON
4. Save
5. Log out and log back in as a **Candidate**
6. Go to `/jobs` and you should see your posted job

## Common Error Messages

### "Access denied" / "permission denied"
- **Cause:** RLS policy not allowing inserts
- **Fix:** Verify your role is `hr_manager` in database

### "Table job_postings does not exist"
- **Cause:** Schema not fully applied
- **Fix:** Re-run `supabase/schema.sql`

### "Foreign key violation on created_by"
- **Cause:** User ID doesn't exist in profiles table
- **Fix:** Manual profile creation may have failed; delete and re-create your account

## Database Verification Commands

Run these to verify your setup is complete:

```sql
-- 1. Check profiles table
SELECT COUNT(*) as profile_count FROM profiles;

-- 2. Check job_postings table
SELECT COUNT(*) as job_count FROM job_postings;

-- 3. View all jobs
SELECT id, title, created_by, is_published, created_at 
FROM job_postings 
ORDER BY created_at DESC;

-- 4. View all HR users
SELECT id, email, role 
FROM profiles 
WHERE role IN ('hr_manager', 'admin');

-- 5. Check RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'job_postings';
```

## Support Steps

If still stuck:

1. **Share browser console errors** — Copy the exact error message
2. **Share database check results** — Run the SQL queries above and share output
3. **Check environment variables** — Verify `.env.local` has correct Supabase URL and keys
4. **Test connection** — Try simple operations first (going to other pages, checking profile)

---

**Last Updated:** April 12, 2026
