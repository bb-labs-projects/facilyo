-- Migration: deletion_safety
-- Prevents accidental data loss through FK constraints, RLS policies, and cleanup triggers.

-- 1. Change checklist_templates -> checklist_instances FK from CASCADE to RESTRICT
-- This prevents deleting a template that still has completed instances.
DO $$
DECLARE
  fk_name text;
BEGIN
  -- Find the existing FK constraint name
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'checklist_instances'
    AND kcu.column_name = 'template_id'
    AND tc.table_schema = 'public';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE checklist_instances DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE checklist_instances
    ADD CONSTRAINT checklist_instances_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES checklist_templates(id)
    ON DELETE RESTRICT;
END $$;

-- 2. Add DELETE policy on vacation_requests allowing users to delete their own rejected requests
CREATE POLICY "Users can delete own rejected requests"
  ON vacation_requests
  FOR DELETE
  USING (user_id = auth.uid() AND status = 'rejected');

-- 3. Auto-cleanup empty work_days when their last time_entry is deleted
CREATE OR REPLACE FUNCTION cleanup_empty_work_days()
RETURNS TRIGGER AS $$
BEGIN
  -- After a time_entry is deleted, check if the parent work_day has any remaining entries
  IF NOT EXISTS (
    SELECT 1 FROM time_entries WHERE work_day_id = OLD.work_day_id
  ) THEN
    DELETE FROM work_days WHERE id = OLD.work_day_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_cleanup_empty_work_days ON time_entries;
CREATE TRIGGER trigger_cleanup_empty_work_days
  AFTER DELETE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_empty_work_days();
