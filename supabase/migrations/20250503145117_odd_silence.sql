/*
  # Remove optimized_url columns and related functions

  1. Updates
    - Remove `optimized_url` column from `images` table
    - Remove `optimized_url` column from `library_images` table
    - Remove the update_image_optimized_url function
    
  2. Purpose
    - Simplify the database schema
    - Remove unused functionality related to image optimization
*/

-- Remove the update_image_optimized_url function
DROP FUNCTION IF EXISTS update_image_optimized_url();

-- Remove the update_image_url_trigger trigger from the images table
DROP TRIGGER IF EXISTS update_image_url_trigger ON images;

-- Remove the update_library_image_url_trigger trigger from the library_images table
DROP TRIGGER IF EXISTS update_library_image_url_trigger ON library_images;

-- Remove the optimized_url column from the images table
ALTER TABLE images DROP COLUMN IF EXISTS optimized_url;

-- Remove the optimized_url column from the library_images table
ALTER TABLE library_images DROP COLUMN IF EXISTS optimized_url;