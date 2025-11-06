/*
  # Create Connections Table

  1. New Tables
    - `connections`
      - `id` (uuid, primary key)
      - `user_one_id` (uuid, foreign key -> users.id)
      - `user_two_id` (uuid, foreign key -> users.id)
      - `status` (text, enum-like: 'pending','accepted','rejected')
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `connections`
    - Policies to allow involved users to view and manage the record
*/

CREATE TABLE IF NOT EXISTS connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_one_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_two_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','accepted','rejected')),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(user_one_id, user_two_id)
);

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_one_id OR auth.uid() = user_two_id);

CREATE POLICY "Users can create connections where they are user_one"
  ON connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_one_id);

CREATE POLICY "Users can update own connections"
  ON connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_one_id OR auth.uid() = user_two_id)
  WITH CHECK (auth.uid() = user_one_id OR auth.uid() = user_two_id);


