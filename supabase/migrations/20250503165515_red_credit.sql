/*
  # Fix Assets Table RLS Policy

  1. Changes
    - Recreate RLS policies for the assets table to ensure proper functionality
    - Ensure insert operations work correctly by properly checking user_id against auth.uid()
  
  2. Security
    - Maintain security by only allowing users to access their own assets
    - Ensure authenticated users can upload their own files
*/

-- First, make sure RLS is enabled on the assets table
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can insert their own assets" ON assets;
DROP POLICY IF EXISTS "Users can select their own assets" ON assets;
DROP POLICY IF EXISTS "Users can update their own assets" ON assets;
DROP POLICY IF EXISTS "Users can delete their own assets" ON assets;

-- Recreate the policies with correct definitions
CREATE POLICY "Users can insert their own assets"
ON assets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own assets"
ON assets
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own assets"
ON assets
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own assets"
ON assets
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);