-- Migration: Vacation/Ferien system (Part 1)
-- Adds vacation_requests table, vacation_status enum, vacation_days_per_year on profiles,
-- extends time_entry_type with 'vacation'

-- 1. Create vacation_status enum
DO $$ BEGIN
  CREATE TYPE vacation_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add 'vacation' to time_entry_type enum (must be in its own transaction before use in CHECK)
DO $$ BEGIN
  ALTER TYPE time_entry_type ADD VALUE 'vacation';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Add vacation_days_per_year to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS vacation_days_per_year DECIMAL(4,1) DEFAULT 25;

-- 4. Create vacation_requests table
CREATE TABLE IF NOT EXISTS vacation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_half_day BOOLEAN DEFAULT false,
  total_days DECIMAL(4,1) NOT NULL,
  status vacation_status DEFAULT 'pending',
  notes TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT check_date_range CHECK (end_date >= start_date),
  CONSTRAINT check_half_day CHECK (
    (is_half_day = false) OR (is_half_day = true AND start_date = end_date)
  ),
  CONSTRAINT check_total_days CHECK (total_days > 0)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_vacation_requests_user_id ON vacation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_vacation_requests_status ON vacation_requests(status);
CREATE INDEX IF NOT EXISTS idx_vacation_requests_dates ON vacation_requests(start_date, end_date);

-- 6. Updated_at trigger for vacation_requests
CREATE OR REPLACE FUNCTION update_vacation_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_vacation_requests_updated_at ON vacation_requests;
CREATE TRIGGER trigger_vacation_requests_updated_at
  BEFORE UPDATE ON vacation_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_vacation_requests_updated_at();

-- 7. RLS Policies for vacation_requests
ALTER TABLE vacation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own and approved vacation requests" ON vacation_requests;
CREATE POLICY "Users can view own and approved vacation requests"
  ON vacation_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR status = 'approved'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Users can create own vacation requests" ON vacation_requests;
CREATE POLICY "Users can create own vacation requests"
  ON vacation_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin and owner can update vacation requests" ON vacation_requests;
CREATE POLICY "Admin and owner can update vacation requests"
  ON vacation_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Users can delete own pending requests" ON vacation_requests;
CREATE POLICY "Users can delete own pending requests"
  ON vacation_requests FOR DELETE
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- 8. Add manage_vacations to role_permissions for admin and owner
INSERT INTO role_permissions (role, permission, enabled)
VALUES
  ('admin', 'manage_vacations', true),
  ('owner', 'manage_vacations', true),
  ('manager', 'manage_vacations', false),
  ('employee', 'manage_vacations', false)
ON CONFLICT DO NOTHING;
