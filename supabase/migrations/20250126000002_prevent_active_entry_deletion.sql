-- Prevent deletion of active time entries
-- This adds a database-level protection

CREATE OR REPLACE FUNCTION prevent_active_entry_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'active' OR OLD.end_time IS NULL THEN
    RAISE EXCEPTION 'Cannot delete active time entries. Please end the entry first.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_active_entry_before_delete
  BEFORE DELETE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_active_entry_deletion();
