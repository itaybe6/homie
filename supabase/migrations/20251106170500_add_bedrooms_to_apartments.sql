-- Add bedrooms column to apartments (idempotent)
-- 1) Create column if missing
-- 2) Backfill nulls to 1
-- 3) Enforce NOT NULL with DEFAULT 1

ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS bedrooms integer;

UPDATE apartments
SET bedrooms = 1
WHERE bedrooms IS NULL;

ALTER TABLE apartments
  ALTER COLUMN bedrooms SET DEFAULT 1,
  ALTER COLUMN bedrooms SET NOT NULL;



