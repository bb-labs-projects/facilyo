-- Rename amount to yearly_amount in client_subscriptions
-- The amount field now stores the yearly amount. Period amounts are calculated at invoice time.
ALTER TABLE client_subscriptions RENAME COLUMN amount TO yearly_amount;
