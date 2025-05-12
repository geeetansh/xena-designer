/*
  # Slim down generation_tasks table and add image_id reference

  1. Schema Updates
    - Add `image_id` column to the `generation_tasks` table to reference the images table
    - Remove redundant columns: `reference_image_urls`, `result_image_url`, `raw_response`
    
  2. Purpose
    - Reduce data duplication by storing image data only in the images table
    - Create a clear relationship between tasks and their resulting images
    - Simplify queries and improve data consistency
*/

-- Add image_id column to generation_tasks table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generation_tasks' AND column_name = 'image_id'
  ) THEN
    ALTER TABLE generation_tasks ADD COLUMN image_id uuid;
    COMMENT ON COLUMN generation_tasks.image_id IS 'Foreign key reference to the images table for the generated image';
  END IF;
END $$;

-- Create a foreign key constraint from generation_tasks.image_id to images.id
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'generation_tasks_image_id_fkey'
  ) THEN
    ALTER TABLE generation_tasks
    ADD CONSTRAINT generation_tasks_image_id_fkey
    FOREIGN KEY (image_id)
    REFERENCES images(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill image_id from result_image_url
-- This is a critical step to maintain data consistency before removing result_image_url
UPDATE generation_tasks t
SET image_id = i.id
FROM images i
WHERE t.result_image_url = i.url
AND t.image_id IS NULL
AND t.result_image_url IS NOT NULL;

-- Create function to ensure synchronization between tables
CREATE OR REPLACE FUNCTION sync_task_with_image()
RETURNS TRIGGER AS $$
BEGIN
  -- When a task is updated to 'completed' and has an image_id
  IF NEW.status = 'completed' AND NEW.image_id IS NOT NULL THEN
    -- Update photoshoots to match the task's status and use the image URL from the images table
    UPDATE photoshoots p
    SET 
      status = 'completed',
      result_image_url = i.url,
      updated_at = NOW()
    FROM images i
    WHERE i.id = NEW.image_id
      AND (
        (p.batch_id = NEW.batch_id AND p.batch_index = NEW.batch_index) OR
        (p.variation_group_id = NEW.batch_id AND p.variation_index = NEW.batch_index)
      )
      AND p.status = 'processing';
  -- When a task is updated to 'failed'
  ELSIF NEW.status = 'failed' THEN
    -- Update photoshoots to match the task's failed status
    UPDATE photoshoots p
    SET 
      status = 'failed',
      error_message = NEW.error_message,
      updated_at = NOW()
    WHERE (
      (p.batch_id = NEW.batch_id AND p.batch_index = NEW.batch_index) OR
      (p.variation_group_id = NEW.batch_id AND p.variation_index = NEW.batch_index)
    )
    AND p.status = 'processing';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to sync tasks with images and photoshoots
DROP TRIGGER IF EXISTS task_update_sync_trigger ON generation_tasks;
CREATE TRIGGER task_update_sync_trigger
AFTER UPDATE OF status, image_id ON generation_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_task_with_image();

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS generation_tasks_image_id_idx ON generation_tasks(image_id);

-- We're not removing result_image_url, reference_image_urls, and raw_response yet
-- We'll do that in a later migration after validating the new approach works properly
-- This ensures we have a fallback if needed