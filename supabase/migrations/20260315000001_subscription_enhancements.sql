-- Add contract_start_date and property_id to client_subscriptions
ALTER TABLE client_subscriptions ADD COLUMN contract_start_date DATE;
ALTER TABLE client_subscriptions ADD COLUMN property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
CREATE INDEX idx_client_subscriptions_property ON client_subscriptions(property_id);

-- Add billing_mode to organization_billing_settings
ALTER TABLE organization_billing_settings ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'advance';
ALTER TABLE organization_billing_settings ADD CONSTRAINT chk_billing_mode CHECK (billing_mode IN ('advance', 'arrears'));
