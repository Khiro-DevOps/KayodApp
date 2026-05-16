-- Add tenant_name for B2B SaaS company identification
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS tenant_name text;
