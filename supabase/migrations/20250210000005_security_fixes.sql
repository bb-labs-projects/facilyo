-- Security fixes migration
-- 1. Add authorization check to convert_meldung_to_aufgabe function
-- 2. Restrict auth_credentials SELECT policy to admin and owner only

-- ============================================
-- 1. Fix convert_meldung_to_aufgabe: Add role check
-- ============================================
CREATE OR REPLACE FUNCTION convert_meldung_to_aufgabe(
  p_meldung_id UUID,
  p_user_id UUID,
  p_assigned_to UUID DEFAULT NULL,
  p_due_date DATE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_aufgabe_id UUID;
  v_meldung RECORD;
  v_caller_role TEXT;
BEGIN
  -- Authorization: verify caller has appropriate role
  v_caller_role := public.get_my_role();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'owner', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient role to convert Meldung';
  END IF;

  -- Get the meldung
  SELECT * INTO v_meldung FROM issues WHERE id = p_meldung_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meldung not found';
  END IF;

  IF v_meldung.converted_to_task THEN
    RAISE EXCEPTION 'Meldung already converted';
  END IF;

  -- Create the aufgabe
  INSERT INTO aufgaben (
    property_id,
    source_meldung_id,
    created_by,
    assigned_to,
    title,
    description,
    priority,
    status,
    due_date
  ) VALUES (
    v_meldung.property_id,
    p_meldung_id,
    p_user_id,
    COALESCE(p_assigned_to, v_meldung.assigned_to),
    v_meldung.title,
    v_meldung.description,
    v_meldung.priority,
    CASE
      WHEN v_meldung.status = 'closed' THEN 'closed'::issue_status
      WHEN v_meldung.status = 'resolved' THEN 'resolved'::issue_status
      ELSE 'open'::issue_status
    END,
    p_due_date
  ) RETURNING id INTO v_aufgabe_id;

  -- Mark meldung as converted
  UPDATE issues
  SET
    converted_to_task = TRUE,
    converted_at = NOW(),
    converted_by = p_user_id
  WHERE id = p_meldung_id;

  RETURN v_aufgabe_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. Restrict auth_credentials SELECT to admin and owner only
-- ============================================
DROP POLICY IF EXISTS "Privileged users can read all credentials" ON auth_credentials;

CREATE POLICY "Admin and owner can read all credentials"
  ON auth_credentials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );
