/*
  # Create Apartments Table

  1. New Tables
    - `apartments`
      - `id` (uuid, primary key) - Unique apartment identifier
      - `owner_id` (uuid, foreign key) - References users table
      - `title` (text) - Apartment title
      - `description` (text) - Apartment description
      - `address` (text) - Full address
      - `city` (text) - City name for filtering
      - `price` (numeric) - Monthly rent price
      - `room_type` (text) - Type of room (private, shared, etc.)
      - `bedrooms` (integer) - Number of bedrooms
      - `bathrooms` (integer) - Number of bathrooms
      - `image_url` (text) - Apartment image URL
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `apartments` table
    - Add policy for authenticated users to view all apartments
    - Add policy for users to insert their own apartments
    - Add policy for apartment owners to update their apartments
    - Add policy for apartment owners to delete their apartments
*/

CREATE TABLE IF NOT EXISTS apartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  address text NOT NULL,
  city text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  room_type text NOT NULL DEFAULT 'private',
  bedrooms integer NOT NULL DEFAULT 1,
  bathrooms integer NOT NULL DEFAULT 1,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view apartments"
  ON apartments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own apartments"
  ON apartments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update own apartments"
  ON apartments FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete own apartments"
  ON apartments FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);
