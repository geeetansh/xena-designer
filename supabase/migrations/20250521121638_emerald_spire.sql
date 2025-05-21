/*
  # Remove image quality settings column

  1. Updates
    - Remove `image_quality` column from `user_profiles` table
    
  2. Purpose
    - Remove unused feature
    - Simplify database schema
    - Avoid confusion with outdated settings
*/

-- Remove image_quality column from user_profiles table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'image_quality'
  ) THEN
    ALTER TABLE user_profiles DROP COLUMN image_quality;
  END IF;
END $$;

-- Update the init_user_profile function to remove the image_quality parameter
CREATE OR REPLACE FUNCTION public.init_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, credits, credits_used)
  VALUES (NEW.id, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;