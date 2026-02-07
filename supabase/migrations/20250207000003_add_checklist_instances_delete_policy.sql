-- Add missing DELETE policy for checklist_instances
-- Without this, RLS silently blocks deletion
CREATE POLICY "Privileged users can delete checklist instances"
  ON checklist_instances FOR DELETE
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));
