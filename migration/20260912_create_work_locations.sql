-- ============================================================
-- KAYOD HRIS — Work Locations & Geofencing Schema Migration
-- Creates work_locations table for HR-configurable sites and geofence radii
-- ============================================================

CREATE TABLE IF NOT EXISTS work_locations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL,
  address         text,
  latitude        numeric(10, 7) NOT NULL,
  longitude       numeric(10, 7) NOT NULL,
  radius_meters   int NOT NULL DEFAULT 200,
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Ensure only one default work location exists
CREATE UNIQUE INDEX IF NOT EXISTS work_locations_single_default_idx
  ON work_locations(is_default)
  WHERE is_default = true;

-- Link employees and profiles to a work location
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS work_location_id uuid REFERENCES work_locations(id) ON DELETE SET NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS work_location_id uuid REFERENCES work_locations(id) ON DELETE SET NULL;

-- Seed default office site (Manila HQ)
INSERT INTO work_locations (name, address, latitude, longitude, radius_meters, is_default)
VALUES (
  'Manila Main Headquarters',
  'Padre Faura St, Ermita, Manila, 1000 Metro Manila',
  14.5794,
  120.9822,
  200,
  true
)
ON CONFLICT DO NOTHING;
