-- Migration: Fix RLS policy recursion on profiles table
-- The previous policy queried profiles from within the profiles RLS policy, causing infinite recursion

-- Create a SECURITY DEFINER function to get user role without RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Drop the problematic policies
DROP POLICY IF EXISTS "Privileged users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Owners and managers can update profiles" ON profiles;

-- Recreate profiles policies using the security definer function
CREATE POLICY "Users can view own profile or privileged can view all"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR public.get_my_role() IN ('admin', 'owner', 'manager')
  );

CREATE POLICY "Users can update own profile or privileged can update all"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR public.get_my_role() IN ('owner', 'manager')
  );

-- Fix similar recursion issues in other policies that reference profiles table

-- Properties: use function instead of subquery
DROP POLICY IF EXISTS "Users can view assigned properties" ON properties;
CREATE POLICY "Users can view assigned properties"
  ON properties FOR SELECT
  USING (
    id IN (
      SELECT property_id FROM property_assignments
      WHERE user_id = auth.uid()
    )
    OR public.get_my_role() IN ('admin', 'owner', 'manager')
  );

-- Property assignments
DROP POLICY IF EXISTS "Privileged users can view all assignments" ON property_assignments;
DROP POLICY IF EXISTS "Users can view their assignments" ON property_assignments;
CREATE POLICY "Users can view assignments"
  ON property_assignments FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'owner', 'manager')
  );

DROP POLICY IF EXISTS "Privileged users can create assignments" ON property_assignments;
CREATE POLICY "Privileged users can create assignments"
  ON property_assignments FOR INSERT
  WITH CHECK (public.get_my_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "Privileged users can delete assignments" ON property_assignments;
CREATE POLICY "Privileged users can delete assignments"
  ON property_assignments FOR DELETE
  USING (public.get_my_role() IN ('owner', 'manager'));

-- Issues: fix update policy
DROP POLICY IF EXISTS "Users can update their own issues" ON issues;
CREATE POLICY "Users can update their own issues"
  ON issues FOR UPDATE
  USING (
    reported_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.get_my_role() IN ('admin', 'owner', 'manager')
  );

-- Aufgaben policies
DROP POLICY IF EXISTS "Privileged users can view all aufgaben" ON aufgaben;
CREATE POLICY "Privileged users can view all aufgaben"
  ON aufgaben FOR SELECT
  USING (
    public.get_my_role() IN ('admin', 'owner', 'manager')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR property_id IN (
      SELECT property_id FROM property_assignments
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Privileged users can create aufgaben" ON aufgaben;
CREATE POLICY "Privileged users can create aufgaben"
  ON aufgaben FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND public.get_my_role() IN ('admin', 'owner', 'manager')
  );

DROP POLICY IF EXISTS "Users can update aufgaben they manage or are assigned to" ON aufgaben;
CREATE POLICY "Users can update aufgaben they manage or are assigned to"
  ON aufgaben FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.get_my_role() IN ('admin', 'owner', 'manager')
  );

DROP POLICY IF EXISTS "Privileged users can delete aufgaben" ON aufgaben;
CREATE POLICY "Privileged users can delete aufgaben"
  ON aufgaben FOR DELETE
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));

-- Checklist templates
DROP POLICY IF EXISTS "Privileged users can create checklist templates" ON checklist_templates;
CREATE POLICY "Privileged users can create checklist templates"
  ON checklist_templates FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "Privileged users can update checklist templates" ON checklist_templates;
CREATE POLICY "Privileged users can update checklist templates"
  ON checklist_templates FOR UPDATE
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "Privileged users can delete checklist templates" ON checklist_templates;
CREATE POLICY "Privileged users can delete checklist templates"
  ON checklist_templates FOR DELETE
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));

-- Checklist completions
DROP POLICY IF EXISTS "Users can view completions for their checklist instances" ON checklist_item_completions;
CREATE POLICY "Users can view completions for their checklist instances"
  ON checklist_item_completions FOR SELECT
  USING (
    checklist_instance_id IN (
      SELECT ci.id FROM checklist_instances ci
      JOIN time_entries te ON ci.time_entry_id = te.id
      WHERE te.user_id = auth.uid()
    )
    OR public.get_my_role() IN ('admin', 'owner', 'manager')
  );

-- Properties management
DROP POLICY IF EXISTS "Privileged users can create properties" ON properties;
CREATE POLICY "Privileged users can create properties"
  ON properties FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "Privileged users can update properties" ON properties;
CREATE POLICY "Privileged users can update properties"
  ON properties FOR UPDATE
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "Privileged users can delete properties" ON properties;
CREATE POLICY "Privileged users can delete properties"
  ON properties FOR DELETE
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));
