-- Allow admin/owner/manager to view ALL checklist instances (not just their own).
-- The original policy only allowed users to see instances tied to their own time entries.
CREATE POLICY "Privileged users can view all checklist instances"
  ON checklist_instances FOR SELECT
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));
