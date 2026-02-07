-- Migration: Update time_entries constraint to allow vacation entries
-- Must be in a separate migration from the enum ADD VALUE statement

ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS check_entry_type_property_id;
ALTER TABLE time_entries
ADD CONSTRAINT check_entry_type_property_id
CHECK (
  (entry_type = 'property' AND property_id IS NOT NULL) OR
  (entry_type IN ('travel', 'break', 'vacation') AND property_id IS NULL)
);
