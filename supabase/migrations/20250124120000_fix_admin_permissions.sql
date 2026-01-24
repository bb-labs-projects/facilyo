-- Fix: Add 'admin' role to profile update policy
DROP POLICY IF EXISTS "Owners and managers can update profiles" ON profiles;
CREATE POLICY "Privileged users can update profiles"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'owner', 'manager')
    )
  );

-- Fix: Add 'admin' role to property_assignments insert policy
DROP POLICY IF EXISTS "Privileged users can create assignments" ON property_assignments;
CREATE POLICY "Privileged users can create assignments"
  ON property_assignments FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

-- Fix: Add 'admin' role to property_assignments delete policy
DROP POLICY IF EXISTS "Privileged users can delete assignments" ON property_assignments;
CREATE POLICY "Privileged users can delete assignments"
  ON property_assignments FOR DELETE
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));
