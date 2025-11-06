-- Add multiple images support to apartments
ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS image_urls text[];

-- Note: backfill from legacy image_url skipped because the column
-- may not exist in all environments


