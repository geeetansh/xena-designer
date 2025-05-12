/*
  # Add helper function to check photoshoot-to-image sync

  1. New Functions
    - `check_photoshoot_image_sync` - Function to identify completed photoshoots missing from the images table

  2. Purpose
    - Provide a way to check for and troubleshoot sync issues
    - Help with monitoring and maintenance
*/

-- Create function to check for photoshoots that aren't properly synced to images table
CREATE OR REPLACE FUNCTION check_photoshoot_image_sync()
RETURNS TABLE (
  photoshoot_id UUID,
  photoshoot_name TEXT,
  result_image_url TEXT,
  completed_at TIMESTAMPTZ,
  in_images_table BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS photoshoot_id,
    p.name AS photoshoot_name,
    p.result_image_url,
    p.updated_at AS completed_at,
    EXISTS (
      SELECT 1 
      FROM images i 
      WHERE i.url = p.result_image_url
    ) AS in_images_table
  FROM photoshoots p
  WHERE 
    p.status = 'completed' 
    AND p.result_image_url IS NOT NULL
  ORDER BY p.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comments for the function
COMMENT ON FUNCTION check_photoshoot_image_sync IS 'Checks if completed photoshoots have corresponding entries in the images table';

-- Usage instructions:
-- SELECT * FROM check_photoshoot_image_sync() WHERE in_images_table = false;  -- Find missing entries
-- SELECT * FROM check_photoshoot_image_sync();  -- Check all completed photoshoots