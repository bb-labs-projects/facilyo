-- Add clients table for invoicing purposes
-- Clients own properties; invoices will be sent to clients

-- ============================================
-- 1. Create clients table
-- ============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_organization ON clients(organization_id);

-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger (reuse existing function)
CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 2. Add client_id FK to properties
-- ============================================
ALTER TABLE properties ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- ============================================
-- 3. RLS policies for clients (same pattern as properties)
-- ============================================

-- SELECT: any authenticated user in org can see clients (needed for property form dropdown)
CREATE POLICY "clients_select"
  ON clients FOR SELECT
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_super_admin()
  );

-- INSERT: admin/owner/manager only
CREATE POLICY "clients_insert"
  ON clients FOR INSERT
  WITH CHECK (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- UPDATE: admin/owner/manager only
CREATE POLICY "clients_update"
  ON clients FOR UPDATE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );

-- DELETE: admin/owner/manager only
CREATE POLICY "clients_delete"
  ON clients FOR DELETE
  USING (
    (
      organization_id = public.get_my_org_id()
      AND public.get_my_role() IN ('admin', 'owner', 'manager')
    )
    OR public.is_super_admin()
  );
