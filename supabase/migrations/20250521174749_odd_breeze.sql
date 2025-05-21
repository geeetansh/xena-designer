/*
  # Add Support for Image Editing Feature

  1. Updates
    - Updates to enable tracking of edited images 
    - No new tables needed as we'll use the existing images table

  2. Changes
    - Add new indexes to improve query performance for edited images
    - Add necessary permissions for image editing feature
*/

-- Add indexes to optimize queries for image editing
CREATE INDEX IF NOT EXISTS idx_images_is_edited ON public.images USING btree (metadata->>'isEdited');
CREATE INDEX IF NOT EXISTS idx_images_original_image_id ON public.images USING btree (metadata->>'originalJobId');

-- Ensure the images table can properly store metadata about edited images
DO $$
BEGIN
  -- Check if metadata column exists, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'images' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.images ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Ensure RLS policies allow users to modify their own images
DO $$
BEGIN
  -- Check for modification policy, create if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'images' AND 
          policyname = 'Users can update their own images'
  ) THEN
    CREATE POLICY "Users can update their own images" ON public.images
      FOR UPDATE 
      TO authenticated
      USING ((uid() = user_id));
  END IF;
END $$;

-- You can extend this migration if additional features are needed
-- to support image editing (e.g., tracking edit history, etc.)

-- Reset the function cache to ensure RLS rules are applied correctly
SELECT pg_reload_conf();