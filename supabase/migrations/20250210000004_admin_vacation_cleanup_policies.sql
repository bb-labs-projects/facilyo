-- Allow admins/owners to delete vacation time entries for other users
-- Required for vacation cancellation: admins delete vacation entries when revoking approved requests
CREATE POLICY "Admins can delete time entries for all users"
  ON time_entries FOR DELETE
  USING (public.has_calendar_management_role());

-- Allow admins/owners to delete work days for all users
-- Required for cleaning up empty vacation work days during cancellation
CREATE POLICY "Admins can delete work days for all users"
  ON work_days FOR DELETE
  USING (public.has_calendar_management_role());

-- Allow admins/owners to update work days for all users
-- Required for un-finalizing work days during vacation cancellation
CREATE POLICY "Admins can update work days for all users"
  ON work_days FOR UPDATE
  USING (public.has_calendar_management_role());
