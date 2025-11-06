/*
  # Drop apartment_members and create apartment_owners

  - Removes legacy membership table
  - Adds apartment_owners with requested fields
*/

-- Drop old table
DROP TABLE IF EXISTS apartment_members CASCADE;

-- New table: apartment_owners
CREATE TABLE IF NOT EXISTS apartment_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  apartment_id uuid NOT NULL REFERENCES apartments(id) ON DELETE CASCADE
);

-- Security: enable RLS and basic policies
ALTER TABLE apartment_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view apartment owners"
  ON apartment_owners FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert apartment owners"
  ON apartment_owners FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update apartment owners"
  ON apartment_owners FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


