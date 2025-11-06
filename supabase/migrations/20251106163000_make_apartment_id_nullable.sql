-- Make apartment_id nullable to allow owner signup before adding an apartment
ALTER TABLE apartment_owners
  ALTER COLUMN apartment_id DROP NOT NULL;

-- Optional: ensure default is NULL (usually default)
ALTER TABLE apartment_owners
  ALTER COLUMN apartment_id SET DEFAULT NULL;


