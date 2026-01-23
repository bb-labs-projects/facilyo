-- Migration: Roles and Tasks System Update
-- Adds aufgaben table and enhanced completions tracking
-- Note: Enum values (owner, employee) added in previous migration (20250124000001)

-- ============================================
-- 1. Add converted_to_task field to issues
-- ============================================
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS converted_to_task BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_issues_converted ON issues(converted_to_task);

-- ============================================
-- 2. Create aufgaben (tasks) table
-- ============================================
CREATE TABLE IF NOT EXISTS aufgaben (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source_meldung_id UUID REFERENCES issues(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority issue_priority DEFAULT 'medium',
  status issue_status DEFAULT 'open',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for aufgaben
CREATE INDEX IF NOT EXISTS idx_aufgaben_property ON aufgaben(property_id);
CREATE INDEX IF NOT EXISTS idx_aufgaben_assigned_to ON aufgaben(assigned_to);
CREATE INDEX IF NOT EXISTS idx_aufgaben_status ON aufgaben(status);
CREATE INDEX IF NOT EXISTS idx_aufgaben_due_date ON aufgaben(due_date);
CREATE INDEX IF NOT EXISTS idx_aufgaben_source_meldung ON aufgaben(source_meldung_id);

-- Updated_at trigger for aufgaben
CREATE TRIGGER set_aufgaben_updated_at
  BEFORE UPDATE ON aufgaben
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 3. Create checklist_item_completions table for detailed logging
-- ============================================
CREATE TABLE IF NOT EXISTS checklist_item_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_instance_id UUID NOT NULL REFERENCES checklist_instances(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  value_type TEXT CHECK (value_type IN ('checkbox', 'number', 'text', 'photo')),
  boolean_value BOOLEAN,
  numeric_value DECIMAL,
  text_value TEXT,
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_completions_instance ON checklist_item_completions(checklist_instance_id);
CREATE INDEX IF NOT EXISTS idx_checklist_completions_item ON checklist_item_completions(item_id);

-- ============================================
-- 4. RLS Policies
-- ============================================

-- Enable RLS on new tables
ALTER TABLE aufgaben ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_item_completions ENABLE ROW LEVEL SECURITY;

-- Aufgaben policies

-- Admins, owners, and managers can view all aufgaben for their properties
CREATE POLICY "Privileged users can view all aufgaben"
  ON aufgaben FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR property_id IN (
      SELECT property_id FROM property_assignments
      WHERE user_id = auth.uid()
    )
  );

-- Admins, owners, and managers can create aufgaben
CREATE POLICY "Privileged users can create aufgaben"
  ON aufgaben FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

-- Update policy for aufgaben
CREATE POLICY "Users can update aufgaben they manage or are assigned to"
  ON aufgaben FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

-- Delete policy for aufgaben (only privileged users)
CREATE POLICY "Privileged users can delete aufgaben"
  ON aufgaben FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

-- Checklist item completions policies

CREATE POLICY "Users can view completions for their checklist instances"
  ON checklist_item_completions FOR SELECT
  USING (
    checklist_instance_id IN (
      SELECT ci.id FROM checklist_instances ci
      JOIN time_entries te ON ci.time_entry_id = te.id
      WHERE te.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

CREATE POLICY "Users can create completions for their instances"
  ON checklist_item_completions FOR INSERT
  WITH CHECK (
    completed_by = auth.uid()
    AND checklist_instance_id IN (
      SELECT ci.id FROM checklist_instances ci
      JOIN time_entries te ON ci.time_entry_id = te.id
      WHERE te.user_id = auth.uid()
    )
  );

-- ============================================
-- 5. Update existing RLS policies to include owner role
-- ============================================

-- Drop and recreate properties policies to include owner
DROP POLICY IF EXISTS "Users can view assigned properties" ON properties;
CREATE POLICY "Users can view assigned properties"
  ON properties FOR SELECT
  USING (
    id IN (
      SELECT property_id FROM property_assignments
      WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

-- Add insert policy for properties (admin, owner, manager)
CREATE POLICY "Privileged users can create properties"
  ON properties FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

-- Add update policy for properties
CREATE POLICY "Privileged users can update properties"
  ON properties FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

-- Add delete policy for properties
CREATE POLICY "Privileged users can delete properties"
  ON properties FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

-- Update issues policy to include owner
DROP POLICY IF EXISTS "Users can update their own issues" ON issues;
CREATE POLICY "Users can update their own issues"
  ON issues FOR UPDATE
  USING (
    reported_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

-- Add policy for privileged users to view all profiles
CREATE POLICY "Privileged users can view all profiles"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'owner', 'manager')
    )
  );

-- Add policy for owners/managers to update profiles (for employee management)
CREATE POLICY "Owners and managers can update profiles"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('owner', 'manager')
    )
  );

-- Property assignments policies for management
CREATE POLICY "Privileged users can view all assignments"
  ON property_assignments FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

CREATE POLICY "Privileged users can create assignments"
  ON property_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Privileged users can delete assignments"
  ON property_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Checklist templates management policies
CREATE POLICY "Privileged users can create checklist templates"
  ON checklist_templates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

CREATE POLICY "Privileged users can update checklist templates"
  ON checklist_templates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

CREATE POLICY "Privileged users can delete checklist templates"
  ON checklist_templates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
    )
  );

-- ============================================
-- 6. Function to convert Meldung to Aufgabe
-- ============================================
CREATE OR REPLACE FUNCTION convert_meldung_to_aufgabe(
  p_meldung_id UUID,
  p_user_id UUID,
  p_assigned_to UUID DEFAULT NULL,
  p_due_date DATE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_aufgabe_id UUID;
  v_meldung RECORD;
BEGIN
  -- Get the meldung
  SELECT * INTO v_meldung FROM issues WHERE id = p_meldung_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meldung not found';
  END IF;

  IF v_meldung.converted_to_task THEN
    RAISE EXCEPTION 'Meldung already converted';
  END IF;

  -- Create the aufgabe
  INSERT INTO aufgaben (
    property_id,
    source_meldung_id,
    created_by,
    assigned_to,
    title,
    description,
    priority,
    status,
    due_date
  ) VALUES (
    v_meldung.property_id,
    p_meldung_id,
    p_user_id,
    COALESCE(p_assigned_to, v_meldung.assigned_to),
    v_meldung.title,
    v_meldung.description,
    v_meldung.priority,
    CASE
      WHEN v_meldung.status = 'closed' THEN 'closed'::issue_status
      WHEN v_meldung.status = 'resolved' THEN 'resolved'::issue_status
      ELSE 'open'::issue_status
    END,
    p_due_date
  ) RETURNING id INTO v_aufgabe_id;

  -- Mark meldung as converted
  UPDATE issues
  SET
    converted_to_task = TRUE,
    converted_at = NOW(),
    converted_by = p_user_id
  WHERE id = p_meldung_id;

  RETURN v_aufgabe_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
