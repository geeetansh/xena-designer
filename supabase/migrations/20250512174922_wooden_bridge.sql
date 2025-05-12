/*
  # Fix Images Table Schema and Constraints

  1. New Migrations
     - Remove raw_json column from images table
     - Remove raw_response column from generation_tasks table
     - Add index on created_at column for images table

  2. Purpose
     - Remove columns causing storage issues
     - Improve query performance for the gallery page 
     - Fix insert operations that might be failing
*/

-- Remove raw_json column from the images table if it exists
ALTER TABLE IF EXISTS public.images DROP COLUMN IF EXISTS raw_json;

-- Remove raw_response column from generation_tasks table if it exists
ALTER TABLE IF EXISTS public.generation_tasks DROP COLUMN IF EXISTS raw_response;

-- Create an index on created_at to improve query performance
CREATE INDEX IF NOT EXISTS idx_images_created_at_desc ON public.images (created_at DESC);