-- Migration: Add INSERT policy for profiles table
-- Allows privileged users to create new user profiles before they sign up

-- Add INSERT policy for profiles (admin, owner, manager can create profiles)
CREATE POLICY "Privileged users can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

-- Update handle_new_user() to check for existing profile first
-- This allows admins to pre-create profiles that get linked on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if profile already exists (pre-created by admin)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email) THEN
    -- Update the existing profile to link it to the auth user
    UPDATE public.profiles
    SET id = NEW.id, updated_at = NOW()
    WHERE email = NEW.email;
  ELSE
    -- Create new profile
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
