-- 1. Safely add missing status values to the payroll_status Enum type
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_status') THEN
        ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'published';
        ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'draft';
        ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'PUBLISHED';
        ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'DRAFT';
    END IF;
END $$;

-- 2. Set table default value on payslips table using clean type casting
ALTER TABLE public.payslips 
  ALTER COLUMN status SET DEFAULT 'published'::payroll_status;

-- 3. Normalize any existing rows
UPDATE public.payslips 
SET status = 'published'::payroll_status 
WHERE status::text = 'PUBLISHED' OR status IS NULL;
