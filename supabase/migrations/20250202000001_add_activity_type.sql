-- Migration: Add activity_type to time_entries
-- Allows tracking what type of work is being done on a property

-- Create enum for activity types
CREATE TYPE activity_type AS ENUM ('hauswartung', 'rasen_maehen', 'hecken_schneiden', 'regie');

-- Add activity_type column to time_entries
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS activity_type activity_type;

-- Add index for querying by activity type
CREATE INDEX IF NOT EXISTS idx_time_entries_activity_type ON time_entries(activity_type);
