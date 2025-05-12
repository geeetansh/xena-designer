/*
  # Optimize Image Loading Performance

  1. New Indexes
    - Add index on images(user_id, created_at) to optimize user-specific queries with time sorting
    - Add index on images(url) to speed up lookups by URL
    - Add index on images(created_at) for faster sorting by date
    - Add index on images(variation_group_id) to improve variation group lookups
    
  2. Purpose
    - Fix query timeout issues when loading images in the gallery
    - Improve overall database performance for common query patterns
    - Reduce load times for image-heavy pages
*/

-- Add index for user_id and created_at combination (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_images_user_id_created_at ON public.images (user_id, created_at DESC);

-- Add index for url lookups
CREATE INDEX IF NOT EXISTS idx_images_url ON public.images (url);

-- Add index for variation_group_id to improve lookups by group
CREATE INDEX IF NOT EXISTS idx_images_variation_group_id ON public.images (variation_group_id);

-- Add index for created_at to improve sorting and date-based filtering
CREATE INDEX IF NOT EXISTS idx_images_created_at ON public.images (created_at DESC);