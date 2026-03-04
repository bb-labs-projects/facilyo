-- Invoicing schema: enums, tables, RLS policies, indexes, permission seeds, storage bucket
-- Part of Phase 1: Foundation for invoicing feature

-- ============================================
-- 1. Custom Enums
-- ============================================
CREATE TYPE invoice_status AS ENUM ('draft','pending_approval','approved','sent','paid','overdue','cancelled');
CREATE TYPE invoice_line_item_type AS ENUM ('subscription','hours','manual');
CREATE TYPE subscription_interval AS ENUM ('monthly','quarterly','half_yearly','annually');

-- ============================================
-- 2. Organization Billing Settings (1:1 with organizations)
-- ============================================
CREATE TABLE organization_billing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) UNIQUE,
  -- Company info
  company_name TEXT,
  company_address TEXT,
  company_postal_code TEXT,
  company_city TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_website TEXT,
  logo_url TEXT,
  -- Banking
  iban TEXT,
  qr_iban TEXT,
  -- VAT / MWST
  mwst_enabled BOOLEAN DEFAULT TRUE,
  mwst_rate NUMERIC(5,2) DEFAULT 8.10,
  mwst_number TEXT,
  -- Invoice options
  payment_terms_days INTEGER DEFAULT 30,
  invoice_number_prefix TEXT DEFAULT 'RE',
  next_invoice_number INTEGER DEFAULT 1,
  approval_required BOOLEAN DEFAULT FALSE,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_billing_settings_org ON organization_billing_settings(organization_id);

ALTER TABLE organization_billing_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_org_billing_settings_updated_at
  BEFORE UPDATE ON organization_billing_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
CREATE POLICY "org_billing_settings_select"
  ON organization_billing_settings FOR SELECT
  USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "org_billing_settings_insert"
  ON organization_billing_settings FOR INSERT
  WITH CHECK (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "org_billing_settings_update"
  ON organization_billing_settings FOR UPDATE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "org_billing_settings_delete"
  ON organization_billing_settings FOR DELETE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

-- ============================================
-- 3. Service Rates (org-level defaults per activity type)
-- ============================================
CREATE TABLE service_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  activity_type TEXT NOT NULL,
  description TEXT,
  hourly_rate NUMERIC(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, activity_type)
);

CREATE INDEX idx_service_rates_org ON service_rates(organization_id);

ALTER TABLE service_rates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_service_rates_updated_at
  BEFORE UPDATE ON service_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
CREATE POLICY "service_rates_select"
  ON service_rates FOR SELECT
  USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "service_rates_insert"
  ON service_rates FOR INSERT
  WITH CHECK (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "service_rates_update"
  ON service_rates FOR UPDATE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "service_rates_delete"
  ON service_rates FOR DELETE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

-- ============================================
-- 4. Client Rate Overrides (per-client overrides)
-- ============================================
CREATE TABLE client_rate_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  hourly_rate NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, client_id, activity_type)
);

CREATE INDEX idx_client_rate_overrides_org ON client_rate_overrides(organization_id);
CREATE INDEX idx_client_rate_overrides_client ON client_rate_overrides(client_id);

ALTER TABLE client_rate_overrides ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_client_rate_overrides_updated_at
  BEFORE UPDATE ON client_rate_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
CREATE POLICY "client_rate_overrides_select"
  ON client_rate_overrides FOR SELECT
  USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "client_rate_overrides_insert"
  ON client_rate_overrides FOR INSERT
  WITH CHECK (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "client_rate_overrides_update"
  ON client_rate_overrides FOR UPDATE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "client_rate_overrides_delete"
  ON client_rate_overrides FOR DELETE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

-- ============================================
-- 5. Client Subscriptions (recurring plans per client)
-- ============================================
CREATE TABLE client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(10,2) NOT NULL,
  interval subscription_interval NOT NULL DEFAULT 'monthly',
  is_active BOOLEAN DEFAULT TRUE,
  next_billing_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_subscriptions_org ON client_subscriptions(organization_id);
CREATE INDEX idx_client_subscriptions_client ON client_subscriptions(client_id);

ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_client_subscriptions_updated_at
  BEFORE UPDATE ON client_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
CREATE POLICY "client_subscriptions_select"
  ON client_subscriptions FOR SELECT
  USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "client_subscriptions_insert"
  ON client_subscriptions FOR INSERT
  WITH CHECK (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "client_subscriptions_update"
  ON client_subscriptions FOR UPDATE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "client_subscriptions_delete"
  ON client_subscriptions FOR DELETE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

-- ============================================
-- 6. Invoices (main invoice header)
-- ============================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  invoice_number TEXT NOT NULL,
  status invoice_status DEFAULT 'draft',
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal NUMERIC(10,2) DEFAULT 0,
  mwst_rate NUMERIC(5,2) DEFAULT 0,
  mwst_amount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  pdf_url TEXT,
  notes TEXT,
  internal_notes TEXT,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_to_email TEXT,
  paid_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, invoice_number)
);

CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_org_status ON invoices(organization_id, status);
CREATE INDEX idx_invoices_org_issue_date ON invoices(organization_id, issue_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
CREATE POLICY "invoices_select"
  ON invoices FOR SELECT
  USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "invoices_insert"
  ON invoices FOR INSERT
  WITH CHECK (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "invoices_update"
  ON invoices FOR UPDATE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "invoices_delete"
  ON invoices FOR DELETE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

-- ============================================
-- 7. Invoice Line Items
-- ============================================
CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_type invoice_line_item_type NOT NULL,
  sort_order INTEGER DEFAULT 0,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  unit TEXT DEFAULT 'Stk',
  unit_price NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  subscription_id UUID REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_line_items_org ON invoice_line_items(organization_id);
CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_invoice_line_items_updated_at
  BEFORE UPDATE ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
CREATE POLICY "invoice_line_items_select"
  ON invoice_line_items FOR SELECT
  USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "invoice_line_items_insert"
  ON invoice_line_items FOR INSERT
  WITH CHECK (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "invoice_line_items_update"
  ON invoice_line_items FOR UPDATE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "invoice_line_items_delete"
  ON invoice_line_items FOR DELETE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

-- ============================================
-- 8. Invoice Time Entries (junction — prevents re-invoicing)
-- ============================================
CREATE TABLE invoice_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  invoice_line_item_id UUID NOT NULL REFERENCES invoice_line_items(id) ON DELETE CASCADE,
  time_entry_id UUID NOT NULL REFERENCES time_entries(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(time_entry_id)  -- Key constraint: each time entry can only be invoiced once
);

CREATE INDEX idx_invoice_time_entries_org ON invoice_time_entries(organization_id);
CREATE INDEX idx_invoice_time_entries_line_item ON invoice_time_entries(invoice_line_item_id);
CREATE INDEX idx_invoice_time_entries_time_entry ON invoice_time_entries(time_entry_id);

ALTER TABLE invoice_time_entries ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "invoice_time_entries_select"
  ON invoice_time_entries FOR SELECT
  USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "invoice_time_entries_insert"
  ON invoice_time_entries FOR INSERT
  WITH CHECK (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "invoice_time_entries_update"
  ON invoice_time_entries FOR UPDATE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

CREATE POLICY "invoice_time_entries_delete"
  ON invoice_time_entries FOR DELETE
  USING (
    (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'owner', 'manager'))
    OR public.is_super_admin()
  );

-- ============================================
-- 9. Permission Seed: manage_invoices
-- ============================================
INSERT INTO role_permissions (organization_id, role, permission, enabled)
SELECT o.id, r.role::user_role, 'manage_invoices', r.enabled
FROM organizations o
CROSS JOIN (VALUES ('admin',true),('owner',true),('manager',true),('employee',false)) AS r(role, enabled)
ON CONFLICT DO NOTHING;

-- ============================================
-- 10. Storage Bucket: invoices (private)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT DO NOTHING;

-- Org-scoped read access for invoices bucket
CREATE POLICY "invoices_bucket_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  );

-- Org-scoped upload for invoices bucket
CREATE POLICY "invoices_bucket_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
    AND public.get_my_role() IN ('admin', 'owner', 'manager')
  );

-- Org-scoped update for invoices bucket
CREATE POLICY "invoices_bucket_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
    AND public.get_my_role() IN ('admin', 'owner', 'manager')
  );

-- Org-scoped delete for invoices bucket
CREATE POLICY "invoices_bucket_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
    AND public.get_my_role() IN ('admin', 'owner', 'manager')
  );
