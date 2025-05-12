/*
  # Create photoshoots table

  1. New Tables
    - `photoshoots`
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `prompt` (text, not null)
      - `product_image_url` (text, not null)
      - `reference_image_url` (text)
      - `result_image_url` (text)
      - `status` (text, default 'pending')
      - `error_message` (text)
      - `user_id` (uuid, not null)
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())
      - `batch_id` (uuid)
      
  2. Security
    - Enable RLS on `photoshoots` table
    - Add policies for authenticated users to manage their own photoshoots
    
  3. Indexes
    - Create indexes on user_id, status, and batch_id columns for better performance
*/

-- Create photoshoots table
CREATE TABLE IF NOT EXISTS photoshoots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prompt text NOT NULL,
  product_image_url text NOT NULL,
  reference_image_url text,
  result_image_url text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  batch_id uuid
);

-- Add foreign key constraint with authentication users table
ALTER TABLE photoshoots
  ADD CONSTRAINT photoshoots_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- Enable Row Level Security
ALTER TABLE photoshoots ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for photoshoots table
CREATE POLICY "Users can insert their own photoshoots"
  ON photoshoots
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own photoshoots"
  ON photoshoots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own photoshoots"
  ON photoshoots
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own photoshoots"
  ON photoshoots
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS photoshoots_user_id_idx ON photoshoots(user_id);
CREATE INDEX IF NOT EXISTS photoshoots_status_idx ON photoshoots(status);
CREATE INDEX IF NOT EXISTS photoshoots_batch_id_idx ON photoshoots(batch_id);