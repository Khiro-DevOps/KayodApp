-- Add approval workflow and relocation request columns to employee_remote_residences
ALTER TABLE IF EXISTS public.employee_remote_residences
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS pending_address text,
  ADD COLUMN IF NOT EXISTS pending_latitude double precision,
  ADD COLUMN IF NOT EXISTS pending_longitude double precision,
  ADD COLUMN IF NOT EXISTS pending_radius_meters integer,
  ADD COLUMN IF NOT EXISTS relocation_reason text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
