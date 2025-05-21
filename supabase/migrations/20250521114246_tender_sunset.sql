/*
# Undo Little Wave Migration

1. Tables Recreation
  - `reference_images` table
  - `photoshoots` table with all required columns

2. Column Restoration
  - Add batch columns back to `generation_tasks` table
  - Add variation columns back to `images` table
  - Add `photoshoot_instructions` column back to `user_settings` table
  - Add `layout` column back to `automation_sessions` table

3. View Recreation
  - Recreate `stripe_user_subscriptions` view
  - Recreate `stripe_user_orders` view
*/

-- 1. Recreate tables that were dropped

-- Recreate reference_images table
CREATE TABLE IF NOT EXISTS reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID REFERENCES images(id) ON DELETE CASCADE,
  url TEXT NOT NULL
);

-- Enable RLS on reference_images
ALTER TABLE reference_images ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for reference_images
CREATE POLICY "Users can select their own reference images"
  ON reference_images
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM images
    WHERE images.id = reference_images.image_id AND images.user_id = auth.uid()
  ));

-- Recreate photoshoots table
CREATE TABLE IF NOT EXISTS photoshoots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  product_image_url TEXT NOT NULL,
  reference_image_url TEXT,
  result_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  type TEXT NOT NULL DEFAULT 'photoshoot',
  error_message TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  batch_id UUID,
  batch_index INTEGER,
  variation_group_id UUID,
  variation_index INTEGER
);

-- Enable RLS on photoshoots
ALTER TABLE photoshoots ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for photoshoots
CREATE POLICY "Users can select their own photoshoots"
  ON photoshoots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
  
CREATE POLICY "Users can insert their own photoshoots"
  ON photoshoots
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own photoshoots"
  ON photoshoots
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own photoshoots"
  ON photoshoots
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Restore columns that were dropped

-- Add columns to generation_tasks
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS total_in_batch INTEGER;
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS batch_index INTEGER;

-- Add columns to images
ALTER TABLE images ADD COLUMN IF NOT EXISTS variation_group_id UUID;
ALTER TABLE images ADD COLUMN IF NOT EXISTS variation_index INTEGER;

-- Add column to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS photoshoot_instructions JSONB;

-- Add column to automation_sessions
ALTER TABLE automation_sessions ADD COLUMN IF NOT EXISTS layout TEXT;

-- 3. Recreate views

-- Recreate stripe_user_subscriptions view
CREATE OR REPLACE VIEW stripe_user_subscriptions AS
SELECT 
  subs.*,
  c.user_id
FROM 
  stripe_subscriptions subs
JOIN 
  stripe_customers c ON subs.customer_id = c.customer_id
WHERE 
  subs.deleted_at IS NULL AND c.deleted_at IS NULL;

-- Recreate stripe_user_orders view
CREATE OR REPLACE VIEW stripe_user_orders AS
SELECT 
  o.*,
  c.user_id,
  o.created_at AS order_date
FROM 
  stripe_orders o
JOIN 
  stripe_customers c ON o.customer_id = c.customer_id
WHERE 
  c.deleted_at IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_photoshoots_user_id ON photoshoots (user_id);
CREATE INDEX IF NOT EXISTS idx_photoshoots_status ON photoshoots (status);
CREATE INDEX IF NOT EXISTS idx_photoshoots_batch_id ON photoshoots (batch_id);
CREATE INDEX IF NOT EXISTS idx_photoshoots_variation_group_id ON photoshoots (variation_group_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_batch_id ON generation_tasks (batch_id);
CREATE INDEX IF NOT EXISTS idx_images_variation_group_id ON images (variation_group_id);