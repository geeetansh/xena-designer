/*
  # Add performance indexes for images table

  1. Changes
    - Add indexes to improve query performance for the images table
    - Add composite indexes for user_id and created_at to optimize the most common queries
    - Add index for url field to speed up image lookups
  
  2. Purpose
    - Fix timeout issues when querying large image collections
    - Improve overall database performance
    - Reduce statement timeout errors
*/

-- Add index for user_id and created_at combination (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_images_user_id_created_at ON public.images (user_id, created_at DESC);

-- Add index for url lookups
CREATE INDEX IF NOT EXISTS idx_images_url ON public.images (url);

-- Add index for variation_group_id to improve lookups by group
CREATE INDEX IF NOT EXISTS idx_images_variation_group_id ON public.images (variation_group_id);

-- Add index for created_at to improve sorting and date-based filtering
CREATE INDEX IF NOT EXISTS idx_images_created_at ON public.images (created_at DESC);