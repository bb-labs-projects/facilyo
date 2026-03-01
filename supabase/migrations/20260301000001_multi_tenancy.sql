-- Multi-Tenancy Migration
-- Converts from single-tenant to multi-tenant SaaS architecture
-- Strategy: Single-database, RLS-based isolation with organization_id on every table

-- ============================================
-- 1. Create organizations table
-- ============================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  contact_email TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert default organization for existing data
INSERT INTO organizations (id, name, slug, contact_email)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Standard Organisation', 'standard', 'admin@example.com');

-- ============================================
-- 2. Add organization_id and is_super_admin to profiles
-- ============================================
ALTER TABLE profiles ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE profiles ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE;

-- Backfill profiles
UPDATE profiles SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Make NOT NULL
ALTER TABLE profiles ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX idx_profiles_organization ON profiles(organization_id);

-- ============================================
-- 3. Add organization_id to all other tables
-- ============================================

-- properties
ALTER TABLE properties ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE properties SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE properties ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_properties_organization ON properties(organization_id);

-- property_assignments
ALTER TABLE property_assignments ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE property_assignments SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = property_assignments.user_id
);
-- Fallback for any orphans
UPDATE property_assignments SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE property_assignments ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_property_assignments_organization ON property_assignments(organization_id);

-- work_days
ALTER TABLE work_days ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE work_days SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = work_days.user_id
);
UPDATE work_days SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE work_days ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_work_days_organization ON work_days(organization_id);

-- time_entries
ALTER TABLE time_entries ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE time_entries SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = time_entries.user_id
);
UPDATE time_entries SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE time_entries ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_time_entries_organization ON time_entries(organization_id);

-- checklist_templates
ALTER TABLE checklist_templates ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE checklist_templates SET organization_id = (
  SELECT prop.organization_id FROM properties prop WHERE prop.id = checklist_templates.property_id
);
UPDATE checklist_templates SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE checklist_templates ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_checklist_templates_organization ON checklist_templates(organization_id);

-- checklist_instances
ALTER TABLE checklist_instances ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE checklist_instances SET organization_id = (
  SELECT te.organization_id FROM time_entries te WHERE te.id = checklist_instances.time_entry_id
);
UPDATE checklist_instances SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE checklist_instances ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_checklist_instances_organization ON checklist_instances(organization_id);

-- checklist_item_completions
ALTER TABLE checklist_item_completions ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE checklist_item_completions SET organization_id = (
  SELECT ci.organization_id FROM checklist_instances ci WHERE ci.id = checklist_item_completions.checklist_instance_id
);
UPDATE checklist_item_completions SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE checklist_item_completions ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_checklist_item_completions_organization ON checklist_item_completions(organization_id);

-- issues
ALTER TABLE issues ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE issues SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = issues.reported_by
);
UPDATE issues SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE issues ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_issues_organization ON issues(organization_id);

-- aufgaben
ALTER TABLE aufgaben ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE aufgaben SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = aufgaben.created_by
);
UPDATE aufgaben SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE aufgaben ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_aufgaben_organization ON aufgaben(organization_id);

-- user_invitations
ALTER TABLE user_invitations ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE user_invitations SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE user_invitations ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_user_invitations_organization ON user_invitations(organization_id);

-- auth_credentials
ALTER TABLE auth_credentials ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE auth_credentials SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = auth_credentials.user_id
);
UPDATE auth_credentials SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE auth_credentials ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_auth_credentials_organization ON auth_credentials(organization_id);

-- auth_audit_log
ALTER TABLE auth_audit_log ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE auth_audit_log SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = auth_audit_log.user_id
);
UPDATE auth_audit_log SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
-- auth_audit_log allows NULL org_id for pre-login events (unknown user)
CREATE INDEX idx_auth_audit_log_organization ON auth_audit_log(organization_id);

-- role_permissions
ALTER TABLE role_permissions ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE role_permissions SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE role_permissions ALTER COLUMN organization_id SET NOT NULL;
-- Drop old unique and add new org-scoped unique
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_permission_key;
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_org_role_permission_key UNIQUE (organization_id, role, permission);
CREATE INDEX idx_role_permissions_organization ON role_permissions(organization_id);

-- vacation_requests
ALTER TABLE vacation_requests ADD COLUMN organization_id UUID REFERENCES organizations(id);
UPDATE vacation_requests SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = vacation_requests.user_id
);
UPDATE vacation_requests SET organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE vacation_requests ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_vacation_requests_organization ON vacation_requests(organization_id);

-- ============================================
-- 4. Helper functions
-- ============================================

-- Replace get_my_role to also be org-aware (stays compatible)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get the current user's organization_id
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 5. Drop ALL existing RLS policies
-- ============================================

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Privileged users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Owners and managers can update profiles" ON profiles;
DROP POLICY IF EXISTS "Privileged users can update profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile or privileged can view all" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile or privileged can update all" ON profiles;
DROP POLICY IF EXISTS "Privileged users can insert profiles" ON profiles;

-- properties
DROP POLICY IF EXISTS "Users can view assigned properties" ON properties;
DROP POLICY IF EXISTS "Privileged users can create properties" ON properties;
DROP POLICY IF EXISTS "Privileged users can update properties" ON properties;
DROP POLICY IF EXISTS "Privileged users can delete properties" ON properties;

-- property_assignments
DROP POLICY IF EXISTS "Users can view their assignments" ON property_assignments;
DROP POLICY IF EXISTS "Privileged users can view all assignments" ON property_assignments;
DROP POLICY IF EXISTS "Users can view assignments" ON property_assignments;
DROP POLICY IF EXISTS "Privileged users can create assignments" ON property_assignments;
DROP POLICY IF EXISTS "Privileged users can delete assignments" ON property_assignments;

-- work_days
DROP POLICY IF EXISTS "Users can view their own work days" ON work_days;
DROP POLICY IF EXISTS "Users can create their own work days" ON work_days;
DROP POLICY IF EXISTS "Users can update their own work days" ON work_days;
DROP POLICY IF EXISTS "Admins can view all work days" ON work_days;
DROP POLICY IF EXISTS "Admins can update all work days" ON work_days;
DROP POLICY IF EXISTS "Admins can update work days for all users" ON work_days;
DROP POLICY IF EXISTS "Admins can insert work days for all users" ON work_days;
DROP POLICY IF EXISTS "Admins can delete work days for all users" ON work_days;

-- time_entries
DROP POLICY IF EXISTS "Users can view their own time entries" ON time_entries;
DROP POLICY IF EXISTS "Users can create their own time entries" ON time_entries;
DROP POLICY IF EXISTS "Users can update their own time entries" ON time_entries;
DROP POLICY IF EXISTS "Users can delete their own time entries" ON time_entries;
DROP POLICY IF EXISTS "Admins can view all time entries" ON time_entries;
DROP POLICY IF EXISTS "Admins can update all time entries" ON time_entries;
DROP POLICY IF EXISTS "Admins can delete all time entries" ON time_entries;
DROP POLICY IF EXISTS "Admins can delete time entries for all users" ON time_entries;
DROP POLICY IF EXISTS "Admins can insert time entries for all users" ON time_entries;

-- checklist_templates
DROP POLICY IF EXISTS "Users can view templates for assigned properties" ON checklist_templates;
DROP POLICY IF EXISTS "Privileged users can create checklist templates" ON checklist_templates;
DROP POLICY IF EXISTS "Privileged users can update checklist templates" ON checklist_templates;
DROP POLICY IF EXISTS "Privileged users can delete checklist templates" ON checklist_templates;

-- checklist_instances
DROP POLICY IF EXISTS "Users can view their checklist instances" ON checklist_instances;
DROP POLICY IF EXISTS "Users can create checklist instances" ON checklist_instances;
DROP POLICY IF EXISTS "Users can update their checklist instances" ON checklist_instances;
DROP POLICY IF EXISTS "Privileged users can delete checklist instances" ON checklist_instances;
DROP POLICY IF EXISTS "Privileged users can view all checklist instances" ON checklist_instances;

-- checklist_item_completions
DROP POLICY IF EXISTS "Users can view completions for their checklist instances" ON checklist_item_completions;
DROP POLICY IF EXISTS "Users can create completions for their instances" ON checklist_item_completions;

-- issues
DROP POLICY IF EXISTS "Users can view issues for assigned properties" ON issues;
DROP POLICY IF EXISTS "Users can create issues" ON issues;
DROP POLICY IF EXISTS "Users can update their own issues" ON issues;
DROP POLICY IF EXISTS "Privileged users can delete issues" ON issues;

-- aufgaben
DROP POLICY IF EXISTS "Privileged users can view all aufgaben" ON aufgaben;
DROP POLICY IF EXISTS "Privileged users can create aufgaben" ON aufgaben;
DROP POLICY IF EXISTS "Users can update aufgaben they manage or are assigned to" ON aufgaben;
DROP POLICY IF EXISTS "Privileged users can delete aufgaben" ON aufgaben;

-- user_invitations
DROP POLICY IF EXISTS "Privileged users can view invitations" ON user_invitations;
DROP POLICY IF EXISTS "Privileged users can create invitations" ON user_invitations;
DROP POLICY IF EXISTS "Privileged users can delete invitations" ON user_invitations;

-- auth_credentials
DROP POLICY IF EXISTS "Users can read own credentials" ON auth_credentials;
DROP POLICY IF EXISTS "Privileged users can read all credentials" ON auth_credentials;
DROP POLICY IF EXISTS "Admin and owner can read all credentials" ON auth_credentials;

-- auth_audit_log
DROP POLICY IF EXISTS "Admins can read audit logs" ON auth_audit_log;
DROP POLICY IF EXISTS "Users can read own audit logs" ON auth_audit_log;

-- role_permissions
DROP POLICY IF EXISTS "Everyone can view role_permissions" ON role_permissions;
DROP POLICY IF EXISTS "Only admin/owner can update role_permissions" ON role_permissions;

-- vacation_requests
DROP POLICY IF EXISTS "Users can view own and approved vacation requests" ON vacation_requests;
DROP POLICY IF EXISTS "Users can create own vacation requests" ON vacation_requests;
DROP POLICY IF EXISTS "Admin and owner can update vacation requests" ON vacation_requests;
DROP POLICY IF EXISTS "Users can delete own pending requests" ON vacation_requests;
DROP POLICY IF EXISTS "Users can delete own rejected requests" ON vacation_requests;

-- ============================================
-- 6. Recreate ALL RLS policies with org scoping
-- ============================================

-- ----- organizations -----
CREATE POLICY "org_select"
  ON organizations FOR SELECT
  USING (
    id = public.get_my_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "org_update"
  ON organizations FOR UPDATE
  USING (public.is_super_admin());

CREATE POLICY "org_insert"
  ON organizations FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY "org_delete"
  ON organizations FOR DELETE
  USING (public.is_super_admin());

-- ----- profiles -----
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

-- ----- properties -----
CREATE POLICY "properties_select"
  ON properties FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        id IN (SELECT property_id FROM property_assignments WHERE user_id = auth.uid())
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "properties_insert"
  ON properties FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "properties_update"
  ON properties FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "properties_delete"
  ON properties FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- ----- property_assignments -----
CREATE POLICY "property_assignments_select"
  ON property_assignments FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "property_assignments_insert"
  ON property_assignments FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "property_assignments_delete"
  ON property_assignments FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- ----- work_days -----
CREATE POLICY "work_days_select"
  ON work_days FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "work_days_insert"
  ON work_days FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "work_days_update"
  ON work_days FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "work_days_delete"
  ON work_days FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- ----- time_entries -----
CREATE POLICY "time_entries_select"
  ON time_entries FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "time_entries_insert"
  ON time_entries FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "time_entries_update"
  ON time_entries FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "time_entries_delete"
  ON time_entries FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

-- ----- checklist_templates -----
CREATE POLICY "checklist_templates_select"
  ON checklist_templates FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        property_id IN (SELECT property_id FROM property_assignments WHERE user_id = auth.uid())
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "checklist_templates_insert"
  ON checklist_templates FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "checklist_templates_update"
  ON checklist_templates FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "checklist_templates_delete"
  ON checklist_templates FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- ----- checklist_instances -----
CREATE POLICY "checklist_instances_select"
  ON checklist_instances FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        time_entry_id IN (SELECT id FROM time_entries WHERE user_id = auth.uid())
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "checklist_instances_insert"
  ON checklist_instances FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND time_entry_id IN (SELECT id FROM time_entries WHERE user_id = auth.uid())
    )
    OR public.is_super_admin()
  );

CREATE POLICY "checklist_instances_update"
  ON checklist_instances FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND time_entry_id IN (SELECT id FROM time_entries WHERE user_id = auth.uid())
    )
    OR public.is_super_admin()
  );

CREATE POLICY "checklist_instances_delete"
  ON checklist_instances FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- ----- checklist_item_completions -----
CREATE POLICY "checklist_item_completions_select"
  ON checklist_item_completions FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND checklist_instance_id IN (
        SELECT ci.id FROM checklist_instances ci
        JOIN time_entries te ON te.id = ci.time_entry_id
        WHERE te.user_id = auth.uid()
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "checklist_item_completions_insert"
  ON checklist_item_completions FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND checklist_instance_id IN (
        SELECT ci.id FROM checklist_instances ci
        JOIN time_entries te ON te.id = ci.time_entry_id
        WHERE te.user_id = auth.uid()
      )
    )
    OR public.is_super_admin()
  );

-- ----- issues -----
CREATE POLICY "issues_select"
  ON issues FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        property_id IN (SELECT property_id FROM property_assignments WHERE user_id = auth.uid())
        OR reported_by = auth.uid()
        OR assigned_to = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "issues_insert"
  ON issues FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND reported_by = auth.uid()
    )
    OR public.is_super_admin()
  );

CREATE POLICY "issues_update"
  ON issues FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        reported_by = auth.uid()
        OR assigned_to = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "issues_delete"
  ON issues FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- ----- aufgaben -----
CREATE POLICY "aufgaben_select"
  ON aufgaben FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "aufgaben_insert"
  ON aufgaben FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "aufgaben_update"
  ON aufgaben FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "aufgaben_delete"
  ON aufgaben FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- ----- user_invitations -----
CREATE POLICY "user_invitations_select"
  ON user_invitations FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "user_invitations_insert"
  ON user_invitations FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "user_invitations_delete"
  ON user_invitations FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- ----- auth_credentials -----
CREATE POLICY "auth_credentials_select"
  ON auth_credentials FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner')
      )
    )
    OR public.is_super_admin()
  );

-- ----- auth_audit_log -----
CREATE POLICY "auth_audit_log_select"
  ON auth_audit_log FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner')
      )
    )
    OR public.is_super_admin()
  );

-- ----- role_permissions -----
CREATE POLICY "role_permissions_select"
  ON role_permissions FOR SELECT
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "role_permissions_update"
  ON role_permissions FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "role_permissions_insert"
  ON role_permissions FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner')
    )
    OR public.is_super_admin()
  );

-- ----- vacation_requests -----
CREATE POLICY "vacation_requests_select"
  ON vacation_requests FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "vacation_requests_insert"
  ON vacation_requests FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

CREATE POLICY "vacation_requests_update"
  ON vacation_requests FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner')
      )
    )
    OR public.is_super_admin()
  );

CREATE POLICY "vacation_requests_delete"
  ON vacation_requests FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        (user_id = auth.uid() AND status IN ('pending', 'rejected'))
        OR public.get_my_role() IN ('admin', 'owner')
      )
    )
    OR public.is_super_admin()
  );

-- ============================================
-- 7. create_organization() stored function
-- ============================================
CREATE OR REPLACE FUNCTION public.create_organization(
  p_org_name TEXT,
  p_slug TEXT,
  p_contact_email TEXT,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
  v_roles TEXT[] := ARRAY['admin', 'owner', 'manager', 'employee'];
  v_permissions TEXT[] := ARRAY[
    'manage_properties', 'manage_employees', 'manage_checklists',
    'manage_aufgaben', 'assign_aufgaben', 'convert_meldungen',
    'view_all_users', 'update_user_roles', 'access_admin_panel',
    'manage_role_permissions', 'manage_user_calendar', 'delete_activity',
    'manage_vacations'
  ];
  v_role TEXT;
  v_perm TEXT;
  v_enabled BOOLEAN;
BEGIN
  -- Create the organization
  INSERT INTO organizations (name, slug, contact_email)
  VALUES (p_org_name, p_slug, p_contact_email)
  RETURNING id INTO v_org_id;

  -- Update the user's profile with the new org
  UPDATE profiles
  SET organization_id = v_org_id, role = 'admin'
  WHERE id = p_user_id;

  -- Update auth_credentials with the new org
  UPDATE auth_credentials
  SET organization_id = v_org_id
  WHERE user_id = p_user_id;

  -- Seed default role_permissions for this org
  FOREACH v_role IN ARRAY v_roles LOOP
    FOREACH v_perm IN ARRAY v_permissions LOOP
      -- Determine default enabled state based on role
      v_enabled := CASE
        WHEN v_role = 'admin' THEN TRUE
        WHEN v_role = 'owner' THEN v_perm != 'delete_activity'
        WHEN v_role = 'manager' THEN v_perm IN (
          'manage_properties', 'manage_employees', 'manage_checklists',
          'manage_aufgaben', 'assign_aufgaben', 'convert_meldungen',
          'view_all_users', 'update_user_roles', 'access_admin_panel'
        )
        ELSE FALSE
      END;

      INSERT INTO role_permissions (organization_id, role, permission, enabled)
      VALUES (v_org_id, v_role::user_role, v_perm::text, v_enabled);
    END LOOP;
  END LOOP;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. Update handle_new_user() trigger
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_invitation RECORD;
  v_org_id UUID;
BEGIN
  -- Get organization_id from user_metadata (set during registration/create-user)
  v_org_id := (NEW.raw_user_meta_data ->> 'organization_id')::UUID;

  -- Check if there's an invitation for this email
  SELECT * INTO v_invitation FROM public.user_invitations WHERE email = NEW.email;

  IF FOUND THEN
    -- Create profile with invited settings
    INSERT INTO public.profiles (id, email, first_name, last_name, role, organization_id)
    VALUES (NEW.id, NEW.email, v_invitation.first_name, v_invitation.last_name, v_invitation.role, COALESCE(v_org_id, v_invitation.organization_id));

    -- Delete the invitation
    DELETE FROM public.user_invitations WHERE email = NEW.email;
  ELSE
    -- Create default profile
    INSERT INTO public.profiles (id, email, organization_id)
    VALUES (NEW.id, NEW.email, COALESCE(v_org_id, 'aaaaaaaa-0000-0000-0000-000000000001'));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. Update convert_meldung_to_aufgabe() to propagate organization_id
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
  v_caller_role TEXT;
  v_org_id UUID;
BEGIN
  -- Authorization: verify caller has appropriate role
  v_caller_role := public.get_my_role();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'owner', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient role to convert Meldung';
  END IF;

  -- Get the caller's org_id
  v_org_id := public.get_my_org_id();

  -- Get the meldung (scoped to org)
  SELECT * INTO v_meldung FROM issues WHERE id = p_meldung_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meldung not found';
  END IF;

  IF v_meldung.converted_to_task THEN
    RAISE EXCEPTION 'Meldung already converted';
  END IF;

  -- Create the aufgabe with organization_id
  INSERT INTO aufgaben (
    property_id,
    source_meldung_id,
    created_by,
    assigned_to,
    title,
    description,
    priority,
    status,
    due_date,
    organization_id
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
    p_due_date,
    v_org_id
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
