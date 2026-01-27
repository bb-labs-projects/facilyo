-- Allow admin, owner, and manager roles to read all auth_credentials
-- This is needed so the admin users page can display usernames and account status
CREATE POLICY "Privileged users can read all credentials"
  ON auth_credentials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'manager')
    )
  );
