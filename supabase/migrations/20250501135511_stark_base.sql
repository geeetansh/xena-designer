/*
  # Consolidate image generation and optimize storage

  1. Updates
    - Ensure `optimized_url` column exists on image tables
    - Add support for batch image generation in the `generate-image` edge function
    - Create function to handle batch image generation
  
  2. Purpose
    - Consolidate all image generation through a single edge function
    - Provide consistent interface for both single and batch image generation
    - Support optimized image loading
*/

-- Ensure optimized_url column exists on images table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'images' AND column_name = 'optimized_url'
  ) THEN
    ALTER TABLE images ADD COLUMN optimized_url text;
    COMMENT ON COLUMN images.optimized_url IS 'URL for optimized version of the image (e.g., WebP format or CDN-transformed)';
  END IF;
END $$;

-- Ensure optimized_url column exists on library_images table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'library_images' AND column_name = 'optimized_url'
  ) THEN
    ALTER TABLE library_images ADD COLUMN optimized_url text;
    COMMENT ON COLUMN library_images.optimized_url IS 'URL for optimized version of the image (e.g., WebP format or CDN-transformed)';
  END IF;
END $$;

-- Create or replace function to deduct multiple credits at once
CREATE OR REPLACE FUNCTION deduct_multiple_credits(user_id_param UUID, amount INT)
RETURNS VOID AS $$
BEGIN
  -- Ensure amount is positive
  IF amount <= 0 THEN
    RETURN;
  END IF;

  -- Create user profile if it doesn't exist
  INSERT INTO user_profiles (user_id, credits, credits_used)
  VALUES (user_id_param, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Update the user's credits - ensure we don't go below 0
  UPDATE user_profiles
  SET 
    credits = GREATEST(credits - amount, 0),
    credits_used = credits_used + amount,
    updated_at = now()
  WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql;

-- Create or replace function to refund credits
CREATE OR REPLACE FUNCTION refund_credit(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
  -- Update the user's credits
  UPDATE user_profiles
  SET 
    credits = credits + 1,
    credits_used = GREATEST(credits_used - 1, 0),
    updated_at = now()
  WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql;