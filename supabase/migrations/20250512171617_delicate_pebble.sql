/*
  # Remove raw_json column from images table

  This migration removes the raw_json column from the images table to reduce storage requirements
  and improve performance, as this data is no longer needed once the images are generated.

  1. Changes:
    - Remove raw_json column from images table
    
  2. Impact:
    - Reduces database storage requirements
    - Improves query performance
    - No data migration needed as existing raw_json data is no longer needed
*/

-- Remove raw_json column from the images table
ALTER TABLE IF EXISTS public.images DROP COLUMN IF EXISTS raw_json;

-- Also remove raw_response column from generation_tasks table as it's no longer needed
ALTER TABLE IF EXISTS public.generation_tasks DROP COLUMN IF EXISTS raw_response;