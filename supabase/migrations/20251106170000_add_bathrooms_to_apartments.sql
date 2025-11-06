-- Add bathrooms column to apartments (idempotent)
-- 1) Create column if missing
-- 2) Backfill nulls to 1
-- 3) Enforce NOT NULL with DEFAULT 1

ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS bathrooms integer;

UPDATE apartments
SET bathrooms = 1
WHERE bathrooms IS NULL;

ALTER TABLE apartments
  ALTER COLUMN bathrooms SET DEFAULT 1,
  ALTER COLUMN bathrooms SET NOT NULL;



