/*
  # Sync completed photoshoots to images table

  1. New Functions
    - `save_photoshoot_to_images` - Trigger function to save completed photoshoot images to the images table

  2. New Triggers
    - `sync_photoshoot_to_images` - Trigger on photoshoots table when status changes to 'completed'

  3. Purpose
    - Ensure that when a photoshoot is completed, its image is automatically saved to the images table
    - Fix issue where photoshoot results weren't being displayed in the gallery
    - Consolidate all generated images in one place for easier management
*/

-- Create function to sync photoshoot images to the images table
CREATE OR REPLACE FUNCTION save_photoshoot_to_images()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if status changed to 'completed' and we have a result image URL
  IF (OLD.status <> 'completed' AND NEW.status = 'completed' AND NEW.result_image_url IS NOT NULL) THEN
    -- Insert into images table if no record exists for this result image
    INSERT INTO images (url, prompt, user_id, created_at, raw_json)
    SELECT 
      NEW.result_image_url, 
      NEW.prompt, 
      NEW.user_id, 
      NEW.created_at,
      json_build_object(
        'source', 'photoshoot',
        'photoshoot_id', NEW.id,
        'photoshoot_name', NEW.name,
        'photoshoot_type', NEW.type,
        'batch_id', NEW.batch_id,
        'batch_index', NEW.batch_index
      )::text
    WHERE NOT EXISTS (
      SELECT 1 FROM images 
      WHERE url = NEW.result_image_url
    );

    -- Also create an asset record for the result image
    INSERT INTO assets (user_id, source, original_url, filename, content_type, created_at)
    SELECT 
      NEW.user_id,
      'generated',
      NEW.result_image_url,
      NEW.name || '.png',
      'image/png',
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM assets 
      WHERE original_url = NEW.result_image_url
    );
    
    RAISE NOTICE 'Saved photoshoot result to images table for photoshoot_id: %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on photoshoots table
CREATE TRIGGER sync_photoshoot_to_images
AFTER UPDATE ON photoshoots
FOR EACH ROW
EXECUTE FUNCTION save_photoshoot_to_images();

-- Backfill existing completed photoshoots
INSERT INTO images (url, prompt, user_id, created_at, raw_json)
SELECT 
  p.result_image_url, 
  p.prompt, 
  p.user_id, 
  p.created_at,
  json_build_object(
    'source', 'photoshoot',
    'photoshoot_id', p.id,
    'photoshoot_name', p.name,
    'photoshoot_type', p.type,
    'batch_id', p.batch_id,
    'batch_index', p.batch_index
  )::text
FROM photoshoots p
WHERE 
  p.status = 'completed' 
  AND p.result_image_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM images 
    WHERE url = p.result_image_url
  );

-- Also backfill assets table
INSERT INTO assets (user_id, source, original_url, filename, content_type, created_at)
SELECT 
  p.user_id,
  'generated',
  p.result_image_url,
  p.name || '.png',
  'image/png',
  p.created_at
FROM photoshoots p
WHERE 
  p.status = 'completed' 
  AND p.result_image_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM assets 
    WHERE original_url = p.result_image_url
  );