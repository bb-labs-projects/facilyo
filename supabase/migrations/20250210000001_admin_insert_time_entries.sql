-- Allow admins/owners to insert work days and time entries for other users
-- Required for vacation approval: admins create vacation time entries for employees

-- Allow admins/owners to insert work days for any user
CREATE POLICY "Admins can insert work days for all users"
  ON work_days FOR INSERT
  WITH CHECK (public.has_calendar_management_role());

-- Allow admins/owners to insert time entries for any user
CREATE POLICY "Admins can insert time entries for all users"
  ON time_entries FOR INSERT
  WITH CHECK (public.has_calendar_management_role());
