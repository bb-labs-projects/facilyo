-- Migration: Add new activity types (privatunterhalt, buero)
-- Extends the activity_type enum with two additional values

-- Add new values to the activity_type enum
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'privatunterhalt';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'buero';
