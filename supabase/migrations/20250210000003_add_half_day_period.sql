-- Add half_day_period column to vacation_requests
-- Allows choosing morning (08:00-12:00) or afternoon (13:00-17:00) for half-day requests

CREATE TYPE half_day_period AS ENUM ('morning', 'afternoon');

ALTER TABLE vacation_requests
ADD COLUMN half_day_period half_day_period;

-- Constraint: if is_half_day is true, half_day_period must be set
ALTER TABLE vacation_requests
ADD CONSTRAINT check_half_day_period
CHECK (
  (is_half_day = false OR is_half_day IS NULL OR half_day_period IS NOT NULL)
);

-- Set existing half-day requests to 'morning' as default
UPDATE vacation_requests
SET half_day_period = 'morning'
WHERE is_half_day = true AND half_day_period IS NULL;
