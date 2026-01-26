-- Migration: Add inactive status and role permissions
-- Phase 1.1: Add is_active columns

-- Add is_active to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- Add is_active to properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_is_active ON properties(is_active);

-- Phase 1.2: Create role_permissions table

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role NOT NULL,
  permission TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, permission)
);

-- Insert default permissions
INSERT INTO role_permissions (role, permission, enabled) VALUES
  -- Admin (all permissions)
  ('admin', 'manage_properties', true),
  ('admin', 'manage_employees', true),
  ('admin', 'manage_checklists', true),
  ('admin', 'manage_aufgaben', true),
  ('admin', 'assign_aufgaben', true),
  ('admin', 'convert_meldungen', true),
  ('admin', 'view_all_users', true),
  ('admin', 'update_user_roles', true),
  ('admin', 'access_admin_panel', true),
  ('admin', 'manage_role_permissions', true),
  -- Owner (all except manage_role_permissions - same as admin)
  ('owner', 'manage_properties', true),
  ('owner', 'manage_employees', true),
  ('owner', 'manage_checklists', true),
  ('owner', 'manage_aufgaben', true),
  ('owner', 'assign_aufgaben', true),
  ('owner', 'convert_meldungen', true),
  ('owner', 'view_all_users', true),
  ('owner', 'update_user_roles', true),
  ('owner', 'access_admin_panel', true),
  ('owner', 'manage_role_permissions', true),
  -- Manager (most admin permissions)
  ('manager', 'manage_properties', true),
  ('manager', 'manage_employees', true),
  ('manager', 'manage_checklists', true),
  ('manager', 'manage_aufgaben', true),
  ('manager', 'assign_aufgaben', true),
  ('manager', 'convert_meldungen', true),
  ('manager', 'view_all_users', true),
  ('manager', 'update_user_roles', true),
  ('manager', 'access_admin_panel', true),
  ('manager', 'manage_role_permissions', false),
  -- Employee (no admin permissions)
  ('employee', 'manage_properties', false),
  ('employee', 'manage_employees', false),
  ('employee', 'manage_checklists', false),
  ('employee', 'manage_aufgaben', false),
  ('employee', 'assign_aufgaben', false),
  ('employee', 'convert_meldungen', false),
  ('employee', 'view_all_users', false),
  ('employee', 'update_user_roles', false),
  ('employee', 'access_admin_panel', false),
  ('employee', 'manage_role_permissions', false)
ON CONFLICT (role, permission) DO NOTHING;

-- RLS for role_permissions
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone can view role_permissions (needed for permission checks)
DROP POLICY IF EXISTS "Everyone can view role_permissions" ON role_permissions;
CREATE POLICY "Everyone can view role_permissions"
  ON role_permissions FOR SELECT
  USING (true);

-- Only admin/owner can update role_permissions
DROP POLICY IF EXISTS "Only admin/owner can update role_permissions" ON role_permissions;
CREATE POLICY "Only admin/owner can update role_permissions"
  ON role_permissions FOR UPDATE
  USING (public.get_my_role() IN ('admin', 'owner'));

-- Phase 1.3: Update RLS policies for properties (employees see only active)

-- Drop the existing policy for viewing assigned properties
DROP POLICY IF EXISTS "Users can view assigned properties" ON properties;

-- Create updated policy: employees see only active properties, managers/admins see all
CREATE POLICY "Users can view assigned properties"
  ON properties FOR SELECT
  USING (
    -- Admins, owners, managers can see all properties
    public.get_my_role() IN ('admin', 'owner', 'manager')
    OR
    -- Employees can only see active properties they are assigned to
    (
      is_active = TRUE
      AND id IN (
        SELECT property_id FROM property_assignments WHERE user_id = auth.uid()
      )
    )
  );

-- Create trigger to update updated_at on role_permissions
CREATE OR REPLACE FUNCTION update_role_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_role_permissions_updated_at ON role_permissions;
CREATE TRIGGER trigger_update_role_permissions_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_role_permissions_updated_at();
