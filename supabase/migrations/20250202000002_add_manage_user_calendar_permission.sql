-- Migration: Add manage_user_calendar permission
-- Allows users to view and edit other users' time entries via calendar

-- Insert the new permission for all roles
INSERT INTO role_permissions (role, permission, enabled)
VALUES
  ('admin', 'manage_user_calendar', true),
  ('owner', 'manage_user_calendar', true),
  ('manager', 'manage_user_calendar', false),
  ('employee', 'manage_user_calendar', false)
ON CONFLICT (role, permission) DO NOTHING;
