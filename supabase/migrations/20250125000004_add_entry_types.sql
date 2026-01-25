-- Migration: Add entry_type to time_entries and is_finalized to work_days
-- This enables tracking of travel time and breaks as separate entries,
-- and permanent work day finalization

-- Create enum type for time entry types
CREATE TYPE time_entry_type AS ENUM ('property', 'travel', 'break');

-- Add entry_type column to time_entries (default to 'property' for existing entries)
ALTER TABLE time_entries
ADD COLUMN entry_type time_entry_type DEFAULT 'property';

-- Make property_id nullable for travel and break entries
ALTER TABLE time_entries
ALTER COLUMN property_id DROP NOT NULL;

-- Add is_finalized flag to work_days (prevents restarting)
ALTER TABLE work_days
ADD COLUMN is_finalized BOOLEAN DEFAULT FALSE;

-- Add constraint: property_id required for 'property' entries, null for others
ALTER TABLE time_entries
ADD CONSTRAINT check_entry_type_property_id
CHECK (
  (entry_type = 'property' AND property_id IS NOT NULL) OR
  (entry_type IN ('travel', 'break') AND property_id IS NULL)
);

-- Update RLS policies if needed (time_entries should be accessible regardless of entry_type)
-- No changes needed to RLS as the existing policies should work

-- Index for entry_type queries
CREATE INDEX idx_time_entries_entry_type ON time_entries(entry_type);
