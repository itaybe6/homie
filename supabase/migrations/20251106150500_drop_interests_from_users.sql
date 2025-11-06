/*
  # Drop interests from users
*/

ALTER TABLE users
  DROP COLUMN IF EXISTS interests;


