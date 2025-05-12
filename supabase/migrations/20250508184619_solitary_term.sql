/*
  # Revert image_id changes and restore previous system

  1. Schema Updates
    - Remove the image_id column and foreign key constraint from generation_tasks
    - Ensure result_image_url and raw_response columns exist
    - Drop the task_update_sync_trigger trigger
    - Create a new trigger to sync photoshoots directly from tasks
    
  2. Purpose
    - Revert to the previous database structure
    - Maintain photoshoot sync using direct result_image_url values
    - Simplify the synchronization process
*/

-- First remove the trigger
DROP TRIGGER IF EXISTS task_update_sync_trigger ON generation_tasks;

-- Drop the image_id foreign key constraint
ALTER TABLE generation_tasks
DROP CONSTRAINT IF EXISTS generation_tasks_image_id_fkey;

-- Drop the image_id index
DROP INDEX IF EXISTS generation_tasks_image_id_idx;

-- Drop the image_id column
ALTER TABLE generation_tasks DROP COLUMN IF EXISTS image_id;

-- Ensure result_image_url exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generation_tasks' AND column_name = 'result_image_url'
  ) THEN
    ALTER TABLE generation_tasks ADD COLUMN result_image_url text;
  END IF;
END $$;

-- Ensure raw_response exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generation_tasks' AND column_name = 'raw_response'
  ) THEN
    ALTER TABLE generation_tasks ADD COLUMN raw_response text;
  END IF;
END $$;

-- Ensure we have an index on result_image_url
CREATE INDEX IF NOT EXISTS generation_tasks_result_image_url_idx 
ON generation_tasks(result_image_url);

-- Create a new trigger function to sync photoshoots from tasks
CREATE OR REPLACE FUNCTION sync_task_with_image()
RETURNS TRIGGER AS $$
BEGIN
  -- Only run if status changes to completed or failed
  IF NEW.status IN ('completed', 'failed') AND OLD.status != NEW.status THEN
    UPDATE photoshoots p
    SET 
      status = NEW.status,
      result_image_url = CASE WHEN NEW.status = 'completed' THEN NEW.result_image_url ELSE p.result_image_url END,
      error_message = CASE WHEN NEW.status = 'failed' THEN NEW.error_message ELSE p.error_message END,
      updated_at = NOW()
    WHERE 
      (p.batch_id = NEW.batch_id AND p.batch_index = NEW.batch_index) OR
      (p.variation_group_id = NEW.batch_id AND p.variation_index = NEW.batch_index);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a new trigger on generation_tasks
CREATE TRIGGER task_update_sync_trigger
AFTER UPDATE OF status ON generation_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_task_with_image();

-- Clear out all other synchronization related objects
DROP VIEW IF EXISTS stuck_photoshoots;
DROP VIEW IF EXISTS photoshoot_sync_status;
DROP FUNCTION IF EXISTS repair_single_photoshoot(UUID);
DROP FUNCTION IF EXISTS diagnose_photoshoot(UUID);
DROP FUNCTION IF EXISTS fix_orphaned_photoshoots();
DROP FUNCTION IF EXISTS full_sync_photoshoots_with_images();
DROP FUNCTION IF EXISTS update_photoshoot_from_image();
DROP FUNCTION IF EXISTS save_photoshoot_to_images();

-- Fix any stuck photoshoots
UPDATE photoshoots p
SET 
  status = t.status,
  result_image_url = t.result_image_url,
  error_message = t.error_message,
  updated_at = NOW()
FROM generation_tasks t
WHERE 
  t.status IN ('completed', 'failed') AND
  p.status = 'processing' AND
  (
    (p.batch_id = t.batch_id AND p.batch_index = t.batch_index) OR
    (p.variation_group_id = t.batch_id AND p.variation_index = t.batch_index)
  );