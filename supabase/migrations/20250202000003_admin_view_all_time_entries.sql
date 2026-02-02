-- Add RLS policies for admins and owners to view all users' time entries and work days

-- Function to check if user has admin or owner role
CREATE OR REPLACE FUNCTION public.has_calendar_management_role()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'owner')
    AND is_active = true
  );
$$;

-- Allow admins/owners to view all work days
CREATE POLICY "Admins can view all work days"
  ON work_days FOR SELECT
  USING (public.has_calendar_management_role());

-- Allow admins/owners to update all work days
CREATE POLICY "Admins can update all work days"
  ON work_days FOR UPDATE
  USING (public.has_calendar_management_role());

-- Allow admins/owners to view all time entries
CREATE POLICY "Admins can view all time entries"
  ON time_entries FOR SELECT
  USING (public.has_calendar_management_role());

-- Allow admins/owners to update all time entries
CREATE POLICY "Admins can update all time entries"
  ON time_entries FOR UPDATE
  USING (public.has_calendar_management_role());

-- Allow admins/owners to delete all time entries
CREATE POLICY "Admins can delete all time entries"
  ON time_entries FOR DELETE
  USING (public.has_calendar_management_role());
