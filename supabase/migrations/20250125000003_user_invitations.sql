-- Migration: Create user_invitations table for pre-registering users
-- This avoids the foreign key constraint issue with profiles table

-- Drop the problematic INSERT policy on profiles (we'll use invitations instead)
DROP POLICY IF EXISTS "Privileged users can insert profiles" ON profiles;

-- Create invitations table
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  role user_role DEFAULT 'employee',
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Policies for invitations
CREATE POLICY "Privileged users can view invitations"
  ON user_invitations FOR SELECT
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));

CREATE POLICY "Privileged users can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

CREATE POLICY "Privileged users can delete invitations"
  ON user_invitations FOR DELETE
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'));

-- Update handle_new_user() to check invitations table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_invitation RECORD;
BEGIN
  -- Check if there's an invitation for this email
  SELECT * INTO v_invitation FROM public.user_invitations WHERE email = NEW.email;

  IF FOUND THEN
    -- Create profile with invited settings
    INSERT INTO public.profiles (id, email, first_name, last_name, role)
    VALUES (NEW.id, NEW.email, v_invitation.first_name, v_invitation.last_name, v_invitation.role);

    -- Delete the invitation
    DELETE FROM public.user_invitations WHERE email = NEW.email;
  ELSE
    -- Create default profile
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
