/*
  # Update existing tables to requested schema

  This migration alters tables that may have been created already by earlier migrations.
  It aligns them with the desired schema:
  - users: add gender, change interests to text[], drop email & updated_at, created_at -> timestamp
  - apartments: drop room-specific fields, add roommates_count/max_roommates/images, created_at -> timestamp
  - apartment_members: drop role, joined_at -> timestamp
*/

-- USERS
ALTER TABLE users
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS updated_at,
  ADD COLUMN IF NOT EXISTS gender text,
  ALTER COLUMN interests TYPE text[] USING (
    CASE WHEN interests IS NULL THEN NULL ELSE ARRAY[interests] END
  ),
  ALTER COLUMN created_at TYPE timestamp USING (created_at AT TIME ZONE 'UTC');

-- APARTMENTS
ALTER TABLE apartments
  DROP COLUMN IF EXISTS room_type,
  DROP COLUMN IF EXISTS bedrooms,
  DROP COLUMN IF EXISTS bathrooms,
  DROP COLUMN IF EXISTS image_url,
  DROP COLUMN IF EXISTS updated_at,
  ADD COLUMN IF NOT EXISTS roommates_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_roommates integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS images text[],
  ALTER COLUMN created_at TYPE timestamp USING (created_at AT TIME ZONE 'UTC');

-- APARTMENT MEMBERS
ALTER TABLE apartment_members
  DROP COLUMN IF EXISTS role,
  ALTER COLUMN joined_at TYPE timestamp USING (joined_at AT TIME ZONE 'UTC');


