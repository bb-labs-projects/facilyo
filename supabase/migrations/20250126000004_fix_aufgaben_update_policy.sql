-- Fix: Allow employees to complete tasks for their assigned properties
-- Previously, employees could see tasks for their properties but couldn't update them

DROP POLICY IF EXISTS "Users can update aufgaben they manage or are assigned to" ON aufgaben;

CREATE POLICY "Users can update aufgaben they manage or are assigned to"
  ON aufgaben FOR UPDATE
  USING (
    -- User is assigned to this specific task
    assigned_to = auth.uid()
    -- User created the task
    OR created_by = auth.uid()
    -- User is a privileged user (admin, owner, manager)
    OR public.get_my_role() IN ('admin', 'owner', 'manager')
    -- User is assigned to the property this task belongs to
    OR property_id IN (
      SELECT property_id FROM property_assignments
      WHERE user_id = auth.uid()
    )
  );
