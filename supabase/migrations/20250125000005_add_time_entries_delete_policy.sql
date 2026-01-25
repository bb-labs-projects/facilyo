-- Add DELETE policy for time_entries
-- Users should be able to delete their own time entries

CREATE POLICY "Users can delete their own time entries"
  ON time_entries FOR DELETE
  USING (user_id = auth.uid());
