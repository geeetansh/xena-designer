/*
  # Add image quality setting to user profiles

  1. Updates
    - Add `image_quality` column to the `user_profiles` table
    
  2. Purpose
    - Allow users to select their preferred image generation quality level
    - Support optimization of API usage and costs
    - Default all users to 'low' quality to improve performance
*/

-- Add image_quality column to user_profiles table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'image_quality'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN image_quality TEXT DEFAULT 'low';
    COMMENT ON COLUMN user_profiles.image_quality IS 'Image generation quality (low, medium, high)';
  END IF;
END $$;

-- Update all existing user profiles to use 'low' quality by default
UPDATE user_profiles SET image_quality = 'low' WHERE image_quality IS NULL;

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Added image_quality column to user_profiles table and set all users to low quality by default';
END $$;