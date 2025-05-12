/*
  # Fix duplicate images issue

  1. Cleanup
    - Removes potentially problematic raw_json and raw_response columns
    - Adds indexes for better query performance
  
  2. Data Integrity
    - Ensures images are unique by URL to prevent duplicates
*/

-- Remove raw_json column from the images table if it exists
ALTER TABLE IF EXISTS public.images DROP COLUMN IF EXISTS raw_json;

-- Remove raw_response column from generation_tasks table if it exists
ALTER TABLE IF EXISTS public.generation_tasks DROP COLUMN IF EXISTS raw_response;

-- Create an index on created_at to improve query performance for sorting
CREATE INDEX IF NOT EXISTS idx_images_created_at_desc ON public.images (created_at DESC);

-- Add a trigger to prevent duplicate image URLs being inserted
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_duplicate_image_urls'
  ) THEN
    CREATE OR REPLACE FUNCTION prevent_duplicate_image_urls()
    RETURNS TRIGGER AS
    $BODY$
    BEGIN
      -- Check if an image with this URL already exists
      IF EXISTS (
        SELECT 1 FROM public.images 
        WHERE url = NEW.url 
        AND user_id = NEW.user_id
      ) THEN
        -- Skip insert for duplicate
        RAISE NOTICE 'Skipping duplicate image with URL: %', NEW.url;
        RETURN NULL;
      END IF;
      
      RETURN NEW;
    END;
    $BODY$
    LANGUAGE plpgsql;

    CREATE TRIGGER prevent_duplicate_image_urls
    BEFORE INSERT ON public.images
    FOR EACH ROW
    EXECUTE FUNCTION prevent_duplicate_image_urls();
  END IF;
END
$$;