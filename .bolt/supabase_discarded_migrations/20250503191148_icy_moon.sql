/*
  # Add reference_images table for compatibility

  1. New Tables
    - `reference_images`
      - `id` (uuid, primary key)
      - `image_id` (uuid, foreign key to images table)
      - `url` (text, not null)
      - `created_at` (timestamptz, default now())
      
  2. Security
    - Enable RLS on `reference_images` table
    - Add policies for authenticated users to manage reference_images for their own images
    
  3. Purpose
    - Maintain backward compatibility with existing code
    - Allows image gallery to display properly
    - Will gradually migrate to using the assets table for all images
*/

-- Create reference_images table
CREATE TABLE IF NOT EXISTS reference_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraint with images table
ALTER TABLE reference_images
  ADD CONSTRAINT reference_images_image_id_fkey 
  FOREIGN KEY (image_id) 
  REFERENCES images(id) 
  ON DELETE CASCADE;

-- Enable Row Level Security
ALTER TABLE reference_images ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for reference_images table
-- Users can select reference images for their own images
CREATE POLICY "Users can select reference images for their images"
  ON reference_images
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM images
    WHERE images.id = reference_images.image_id
    AND images.user_id = auth.uid()
  ));

-- Users can insert reference images for their own images
CREATE POLICY "Users can insert reference images for their images"
  ON reference_images
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM images
    WHERE images.id = reference_images.image_id
    AND images.user_id = auth.uid()
  ));

-- Users can update reference images for their own images
CREATE POLICY "Users can update reference images for their images"
  ON reference_images
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM images
    WHERE images.id = reference_images.image_id
    AND images.user_id = auth.uid()
  ));

-- Users can delete reference images for their own images
CREATE POLICY "Users can delete reference images for their images"
  ON reference_images
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM images
    WHERE images.id = reference_images.image_id
    AND images.user_id = auth.uid()
  ));

-- Create index on image_id for better performance
CREATE INDEX IF NOT EXISTS reference_images_image_id_idx ON reference_images(image_id);

-- Migrate existing reference URLs from assets table
INSERT INTO reference_images (image_id, url)
SELECT 
  i.id AS image_id,
  a.original_url AS url
FROM assets a
JOIN images i ON a.user_id = i.user_id
WHERE 
  a.source = 'reference' AND
  NOT EXISTS (
    SELECT 1 
    FROM reference_images r 
    WHERE r.image_id = i.id AND r.url = a.original_url
  );

-- Create a function to sync image to assets table when saving
CREATE OR REPLACE FUNCTION save_image_to_assets()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert an asset record for the generated image
  INSERT INTO assets (
    user_id,
    source,
    original_url,
    filename,
    content_type,
    created_at
  )
  VALUES (
    NEW.user_id,
    'generated',
    NEW.url,
    'generated-image-' || NEW.id || '.png',
    'image/png',
    NEW.created_at
  )
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on images table to sync to assets
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sync_image_to_assets'
  ) THEN
    CREATE TRIGGER sync_image_to_assets
    AFTER INSERT ON images
    FOR EACH ROW
    EXECUTE FUNCTION save_image_to_assets();
  END IF;
END $$;