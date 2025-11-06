/*
  # Add email and phone to users

  Adds optional contact fields to the users profile table.
*/

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;


