-- Add city column to users table
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS city text;


