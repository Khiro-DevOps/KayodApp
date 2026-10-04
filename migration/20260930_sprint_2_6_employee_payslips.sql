-- ============================================================
-- MIGRATION: Sprint 2.6 Employee Payslips & Route Corrections
-- Migration file: migration/20260930_sprint_2_6_employee_payslips.sql
-- ============================================================

-- 1. Table: payslips
CREATE TABLE IF NOT EXISTS payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    payroll_period_start DATE NOT NULL,
    payroll_period_end DATE NOT NULL,
    pay_date DATE NOT NULL,
    gross_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    basic_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    allowances NUMERIC(12, 2) DEFAULT 0.00,
    overtime_pay NUMERIC(12, 2) DEFAULT 0.00,
    sss_deduction NUMERIC(12, 2) DEFAULT 0.00,
    philhealth_deduction NUMERIC(12, 2) DEFAULT 0.00,
    pagibig_deduction NUMERIC(12, 2) DEFAULT 0.00,
    withholding_tax NUMERIC(12, 2) DEFAULT 0.00,
    other_deductions NUMERIC(12, 2) DEFAULT 0.00,
    total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'published',
    pdf_storage_path TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT payslips_status_check CHECK (status IN ('draft', 'published'))
);

-- Ensure is_hr() function exists
CREATE OR REPLACE FUNCTION is_hr()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('hr_manager', 'admin')
  );
END;
$$;

-- Enable Row Level Security
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

-- 2. Row Level Security Policies

-- Policy: Employees can SELECT ONLY their own payslips where employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid()) AND status = 'published'
DROP POLICY IF EXISTS "employees_select_own_published_payslips" ON payslips;
CREATE POLICY "employees_select_own_published_payslips"
  ON payslips FOR SELECT
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
    AND status = 'published'
  );

-- Policy: HR users (is_hr()) can CRUD payslips strictly scoped to their tenant_id
DROP POLICY IF EXISTS "hr_crud_payslips_tenant_scoped" ON payslips;
CREATE POLICY "hr_crud_payslips_tenant_scoped"
  ON payslips FOR ALL
  TO authenticated
  USING (
    is_hr()
    AND tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    is_hr()
    AND tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
