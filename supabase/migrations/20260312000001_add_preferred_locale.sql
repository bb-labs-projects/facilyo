-- Add preferred_locale column to profiles table
ALTER TABLE profiles ADD COLUMN preferred_locale text DEFAULT 'de-CH';
