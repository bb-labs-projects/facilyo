-- Prevent overlapping vacation requests for the same user
-- Uses an exclusion constraint with daterange overlap operator

-- Enable btree_gist extension (required for exclusion constraints with mixed types)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Reject overlapping duplicate requests before adding constraint
-- For each pair of overlapping active requests by the same user, keep the older one
UPDATE vacation_requests vr
SET status = 'rejected'
WHERE vr.status IN ('pending', 'approved')
  AND EXISTS (
    SELECT 1 FROM vacation_requests other
    WHERE other.user_id = vr.user_id
      AND other.id <> vr.id
      AND other.status IN ('pending', 'approved')
      AND other.start_date <= vr.end_date
      AND other.end_date >= vr.start_date
      AND other.created_at < vr.created_at
  );

-- Add exclusion constraint: no two active (pending/approved) requests
-- for the same user may have overlapping date ranges
ALTER TABLE vacation_requests
ADD CONSTRAINT no_overlapping_vacation_requests
EXCLUDE USING gist (
  user_id WITH =,
  daterange(start_date, end_date, '[]') WITH &&
)
WHERE (status IN ('pending', 'approved'));
