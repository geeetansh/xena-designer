/*
  # Create reference_images table

  1. New Tables
    - `reference_images`
      - `id` (uuid, primary key)
      - `image_id` (uuid, foreign key to images.id)
      - `url` (text, not null)
      - `created_at` (timestamptz, default now())
      
  2. Security
    - Enable RLS on `reference_images` table
    - Add policies for authenticated users to manage their own reference images
    
  3. Purpose
    - Store reference images used when generating AI images
    - Link reference images to generated images for display in the gallery
*/

-- Create reference_images table
CREATE TABLE IF NOT EXISTS reference_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraint with images table (on delete cascade)
ALTER TABLE reference_images
  ADD CONSTRAINT reference_images_image_id_fkey 
  FOREIGN KEY (image_id) 
  REFERENCES images(id) 
  ON DELETE CASCADE;

-- Create index for better performance when querying by image_id
CREATE INDEX IF NOT EXISTS reference_images_image_id_idx 
ON reference_images(image_id);

-- Enable Row Level Security
ALTER TABLE reference_images ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for reference_images table to ensure users can only
-- access reference images associated with their generated images

-- Users can select their own reference images (based on image ownership)
CREATE POLICY "Users can read their own reference images"
  ON reference_images
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM images
      WHERE images.id = reference_images.image_id
      AND images.user_id = auth.uid()
    )
  );

-- Users can insert their own reference images (based on image ownership)
CREATE POLICY "Users can insert their own reference images"
  ON reference_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM images
      WHERE images.id = reference_images.image_id
      AND images.user_id = auth.uid()
    )
  );

-- Users can update their own reference images (based on image ownership)
CREATE POLICY "Users can update their own reference images"
  ON reference_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM images
      WHERE images.id = reference_images.image_id
      AND images.user_id = auth.uid()
    )
  );

-- Users can delete their own reference images (based on image ownership)
CREATE POLICY "Users can delete their own reference images"
  ON reference_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM images
      WHERE images.id = reference_images.image_id
      AND images.user_id = auth.uid()
    )
  );

-- Add comment explaining the table
COMMENT ON TABLE reference_images IS 'Stores reference images used to generate AI images';

-- Stored function to sync completed photoshoots to images table
CREATE OR REPLACE FUNCTION save_photoshoot_to_images() 
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if the photoshoot status changed to completed
  IF NEW.status = 'completed' AND NEW.result_image_url IS NOT NULL THEN
    -- Check if an image record already exists for this photoshoot
    IF NOT EXISTS (
      SELECT 1 FROM images 
      WHERE raw_json::jsonb->>'photoshoot_id' = NEW.id::text
    ) THEN
      -- Insert a new record in the images table
      INSERT INTO images (
        url,
        prompt,
        user_id,
        raw_json
      ) VALUES (
        NEW.result_image_url,
        NEW.prompt,
        NEW.user_id,
        jsonb_build_object(
          'photoshoot_id', NEW.id,
          'photoshoot_name', NEW.name,
          'photoshoot_type', NEW.type,
          'batch_id', NEW.batch_id,
          'created_at', NEW.created_at
        )::text
      );
      
      -- Log the successful sync
      RAISE LOG 'Synced photoshoot % to images table', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on photoshoots table
DROP TRIGGER IF EXISTS sync_photoshoot_to_images ON photoshoots;

CREATE TRIGGER sync_photoshoot_to_images
AFTER UPDATE ON photoshoots
FOR EACH ROW
EXECUTE FUNCTION save_photoshoot_to_images();