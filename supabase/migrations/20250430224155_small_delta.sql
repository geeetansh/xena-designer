/*
  # Add optimized URL fields for image storage

  1. Updates
    - Add `optimized_url` column to `images` table
    - Add `optimized_url` column to `library_images` table
  
  2. Purpose
    - These fields enable tracking of pre-optimized image URLs
    - Support for CDN-processed or WebP/AVIF formatted versions
    - Allow fallback to original URLs when optimized versions aren't available
*/

-- Add optimized_url to the images table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'images' AND column_name = 'optimized_url'
  ) THEN
    ALTER TABLE images ADD COLUMN optimized_url text;
  END IF;
END $$;

-- Add optimized_url to the library_images table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'library_images' AND column_name = 'optimized_url'
  ) THEN
    ALTER TABLE library_images ADD COLUMN optimized_url text;
  END IF;
END $$;

-- Create function to update_url_transformation function
-- This can be used later for automatic URL transformations if needed
CREATE OR REPLACE FUNCTION update_image_optimized_url() 
RETURNS TRIGGER AS $$
BEGIN
  -- Just store the original URL for now
  -- This would be where URL transformations could happen automatically
  -- if we wanted to pre-generate optimized URLs
  NEW.optimized_url := NEW.url;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic URL optimizations
-- Uncomment if you want automatic updates
/*
DROP TRIGGER IF EXISTS update_image_url_trigger ON images;
CREATE TRIGGER update_image_url_trigger
BEFORE INSERT OR UPDATE OF url ON images
FOR EACH ROW
EXECUTE FUNCTION update_image_optimized_url();

DROP TRIGGER IF EXISTS update_library_image_url_trigger ON library_images;
CREATE TRIGGER update_library_image_url_trigger
BEFORE INSERT OR UPDATE OF url ON library_images
FOR EACH ROW
EXECUTE FUNCTION update_image_optimized_url();
*/

-- Add comment explaining these columns
COMMENT ON COLUMN images.optimized_url IS 'URL for optimized version of the image (e.g., WebP format or CDN-transformed)';
COMMENT ON COLUMN library_images.optimized_url IS 'URL for optimized version of the image (e.g., WebP format or CDN-transformed)';