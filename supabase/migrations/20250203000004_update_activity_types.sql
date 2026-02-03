-- Migration: Update activity types
-- Add 'reinigung' activity type
-- Note: PostgreSQL doesn't support removing enum values directly
-- Old values 'privatunterhalt' and 'buero' remain in DB but are no longer used in the UI

ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'reinigung';
