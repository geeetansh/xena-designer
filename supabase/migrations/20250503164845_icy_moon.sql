/*
  # Create assets table for centralized image storage

  1. New Tables
    - `assets`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `source` (text, one of: 'library', 'reference', 'shopify', 'generated')
      - `source_ref` (uuid, optional FK to shopify_product_images.id when source='shopify')
      - `original_url` (text, public storage URL)
      - `filename` (text, original filename)
      - `content_type` (text, MIME type)
      - `size` (bigint, file size in bytes)
      - `created_at` (timestamp with time zone, default now())
      
  2. Security
    - Enable RLS on `assets` table
    - Add policies for authenticated users to manage their own assets
    
  3. Indexes
    - Create indexes on user_id, source, and source_ref for better query performance
*/

-- Create assets table
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  source_ref uuid,
  original_url text NOT NULL,
  filename text,
  content_type text,
  size bigint,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraint with authentication users table
ALTER TABLE assets
  ADD CONSTRAINT assets_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- Add foreign key constraint with shopify_product_images table (optional relationship)
ALTER TABLE assets
  ADD CONSTRAINT assets_source_ref_fkey
  FOREIGN KEY (source_ref)
  REFERENCES shopify_product_images(id)
  ON DELETE SET NULL;

-- Add check constraint to ensure source is one of the allowed values
ALTER TABLE assets
  ADD CONSTRAINT assets_source_check
  CHECK (source IN ('library', 'reference', 'shopify', 'generated'));

-- Enable Row Level Security
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for assets table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS assets_user_id_idx ON assets(user_id);
CREATE INDEX IF NOT EXISTS assets_source_idx ON assets(source);
CREATE INDEX IF NOT EXISTS assets_source_ref_idx ON assets(source_ref);

-- Create function to migrate existing data
CREATE OR REPLACE FUNCTION migrate_existing_images_to_assets()
RETURNS void AS $$
DECLARE
  lib_count integer := 0;
  ref_count integer := 0;
  shopify_count integer := 0;
BEGIN
  -- Migrate library images
  INSERT INTO assets (
    user_id,
    source,
    original_url,
    filename,
    content_type,
    size,
    created_at
  )
  SELECT
    user_id,
    'library',
    url,
    filename,
    content_type,
    size,
    created_at
  FROM library_images
  WHERE NOT EXISTS (
    SELECT 1 FROM assets 
    WHERE source = 'library' AND original_url = library_images.url
  );
  
  GET DIAGNOSTICS lib_count = ROW_COUNT;
  
  -- Migrate reference images (linked to generated images)
  INSERT INTO assets (
    user_id,
    source,
    original_url,
    created_at
  )
  SELECT
    i.user_id,
    'reference',
    r.url,
    r.created_at
  FROM reference_images r
  JOIN images i ON r.image_id = i.id
  WHERE NOT EXISTS (
    SELECT 1 FROM assets 
    WHERE source = 'reference' AND original_url = r.url
  );
  
  GET DIAGNOSTICS ref_count = ROW_COUNT;
  
  -- Migrate shopify product images
  INSERT INTO assets (
    user_id,
    source,
    source_ref,
    original_url,
    filename,
    content_type,
    created_at
  )
  SELECT
    p.user_id,
    'shopify',
    i.id,
    i.url,
    COALESCE(i.alt_text, 'shopify-product-image'),
    'image/jpeg',
    i.created_at
  FROM shopify_product_images i
  JOIN shopify_products p ON i.product_id = p.id
  WHERE NOT EXISTS (
    SELECT 1 FROM assets 
    WHERE source = 'shopify' AND source_ref = i.id
  );
  
  GET DIAGNOSTICS shopify_count = ROW_COUNT;
  
  RAISE NOTICE 'Migration complete: % library images, % reference images, % shopify images', 
    lib_count, ref_count, shopify_count;
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT migrate_existing_images_to_assets();

-- Function can be dropped after execution
DROP FUNCTION migrate_existing_images_to_assets();