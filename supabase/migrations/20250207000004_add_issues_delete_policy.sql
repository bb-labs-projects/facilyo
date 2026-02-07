-- Add DELETE policy for issues
CREATE POLICY "Privileged users can delete issues"
  ON issues FOR DELETE
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));
