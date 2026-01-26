-- Migration: Add auth_credentials and auth_audit_log tables for username-based authentication
-- This replaces email-based Supabase auth with username/password authentication

-- 1. Create auth_credentials table for username and password storage
CREATE TABLE auth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN DEFAULT TRUE,
  temp_password_expires_at TIMESTAMPTZ,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX idx_auth_credentials_username ON auth_credentials(username);
CREATE INDEX idx_auth_credentials_user_id ON auth_credentials(user_id);

-- 2. Create auth_audit_log table for security event tracking
CREATE TABLE auth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  username TEXT,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit log queries
CREATE INDEX idx_auth_audit_log_user ON auth_audit_log(user_id);
CREATE INDEX idx_auth_audit_log_created ON auth_audit_log(created_at);
CREATE INDEX idx_auth_audit_log_event_type ON auth_audit_log(event_type);

-- 3. Add updated_at trigger for auth_credentials
CREATE OR REPLACE FUNCTION update_auth_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_credentials_updated_at
  BEFORE UPDATE ON auth_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_auth_credentials_updated_at();

-- 4. RLS Policies for auth_credentials
ALTER TABLE auth_credentials ENABLE ROW LEVEL SECURITY;

-- Users can only read their own credentials (not password_hash)
CREATE POLICY "Users can read own credentials"
  ON auth_credentials
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update/delete (handled by API routes)
-- No policies for insert/update/delete since these will be done by service role

-- 5. RLS Policies for auth_audit_log
ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs
CREATE POLICY "Admins can read audit logs"
  ON auth_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Users can read their own audit logs
CREATE POLICY "Users can read own audit logs"
  ON auth_audit_log
  FOR SELECT
  USING (auth.uid() = user_id);
