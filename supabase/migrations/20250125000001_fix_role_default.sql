-- Migration: Fix role default from 'worker' to 'employee'
-- The TypeScript/RLS code expects 'employee' as the default role, not 'worker'

-- Change default from 'worker' to 'employee'
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'employee';

-- Update any existing 'worker' roles to 'employee'
UPDATE profiles SET role = 'employee' WHERE role = 'worker';
