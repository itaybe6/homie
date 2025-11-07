-- Add multiple user images support
alter table users
  add column if not exists image_urls text[];

-- Optional note: ensure a public bucket named 'user-images' exists with proper RLS
-- Bucket creation and policies are handled in a separate migration/SQL as needed.


