/*
  # Create Apartment Owners table

  Mirrors the types in types/database.ts for ApartmentOwner.
*/

CREATE TABLE IF NOT EXISTS apartment_owners (
  id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  apartment_id uuid REFERENCES apartments(id),
  created_at timestamp DEFAULT now()
);

ALTER TABLE apartment_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read own" ON apartment_owners
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Owners can insert own" ON apartment_owners
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Owners can update own" ON apartment_owners
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


