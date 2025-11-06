/*
  # Create Apartment Members Table

  1. New Tables
    - `apartment_members`
      - `id` (uuid, primary key) - Unique member record identifier
      - `apartment_id` (uuid, foreign key) - References apartments table
      - `user_id` (uuid, foreign key) - References users table
      - `role` (text) - Member role (owner or roommate)
      - `joined_at` (timestamptz) - When user joined the apartment

  2. Security
    - Enable RLS on `apartment_members` table
    - Add policy for authenticated users to view all apartment members
    - Add policy for users to add themselves to apartments
    - Add policy for apartment owners to manage members
    - Add policy for members to remove themselves

  3. Important Notes
    - This table tracks who lives in which apartment
    - The role field distinguishes between owners and roommates
    - A unique constraint ensures users can't join the same apartment twice
*/

CREATE TABLE IF NOT EXISTS apartment_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id uuid NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'roommate' CHECK (role IN ('owner', 'roommate')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(apartment_id, user_id)
);

ALTER TABLE apartment_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view apartment members"
  ON apartment_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add themselves as roommates"
  ON apartment_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can remove themselves"
  ON apartment_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Apartment owners can manage members"
  ON apartment_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = apartment_members.apartment_id
      AND apartments.owner_id = auth.uid()
    )
  );
