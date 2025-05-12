/*
  # Remove redundant columns from generation_tasks

  1. Schema Updates
    - Remove `result_image_url` column from generation_tasks table
    - Remove `raw_response` column from generation_tasks table
    - Keep `reference_image_urls` for now as it may be useful for debugging
    
  2. Purpose
    - Reduce data duplication between images and generation_tasks tables
    - Simplify data model with clear relationships
    - Improve database performance and reduce storage requirements
    
  3. Description
    - This migration finalizes the slim-down of the generation_tasks table
    - It's a separate migration to ensure image_id relationship is working properly before removing columns
*/

-- We'll keep this commented out for now, as we want to validate the image_id relationship
-- before removing these columns entirely

-- Verify that all completed tasks have an image_id
-- DO $$ 
-- DECLARE
--   orphaned_count INTEGER;
-- BEGIN
--   -- Count tasks that have result_image_url but no image_id
--   SELECT COUNT(*) INTO orphaned_count
--   FROM generation_tasks
--   WHERE status = 'completed'
--     AND result_image_url IS NOT NULL
--     AND image_id IS NULL;
--     
--   -- If there are orphaned tasks, raise a notice and exit
--   IF orphaned_count > 0 THEN
--     RAISE NOTICE 'There are still % completed tasks with result_image_url but no image_id', orphaned_count;
--     RAISE EXCEPTION 'Cannot drop columns until all completed tasks have image_id set';
--   END IF;
-- END $$;

-- -- Remove raw_response column
-- ALTER TABLE generation_tasks DROP COLUMN IF EXISTS raw_response;

-- -- Remove result_image_url column 
-- ALTER TABLE generation_tasks DROP COLUMN IF EXISTS result_image_url;