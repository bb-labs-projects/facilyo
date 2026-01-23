-- Migration: Add new enum values for user_role
-- This must be a separate migration because PostgreSQL can't use new enum values
-- in the same transaction they were added

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'employee';
