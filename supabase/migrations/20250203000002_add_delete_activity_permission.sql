-- Migration: Add delete_activity permission
-- Allows users to delete completed tasks and filled checklists from activity view

-- Insert the new permission for all roles (only admin can delete by default)
INSERT INTO role_permissions (role, permission, enabled)
VALUES
  ('admin', 'delete_activity', true),
  ('owner', 'delete_activity', false),
  ('manager', 'delete_activity', false),
  ('employee', 'delete_activity', false)
ON CONFLICT (role, permission) DO NOTHING;
