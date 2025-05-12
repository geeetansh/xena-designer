/*
  # Synchronize photoshoots with generation tasks

  1. New Functions
    - `sync_photoshoot_from_task` - Trigger function to sync photoshoot status when a generation task is updated
  
  2. New Triggers
    - `update_photoshoot_on_task_update` - Trigger on generation_tasks table
  
  3. Purpose
    - Ensure photoshoots are automatically updated when generation tasks change state
    - Fix issues where photoshoots remain in "processing" state after generation is complete
*/

-- Create function to synchronize photoshoot status from generation task status
CREATE OR REPLACE FUNCTION sync_photoshoot_from_task()
RETURNS TRIGGER AS $$
DECLARE
  photoshoot_count INTEGER;
BEGIN
  -- Only update photoshoot if status has changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Log the sync attempt for debugging
  RAISE LOG 'Syncing photoshoot for task: %, batch: %, index: %, status: %', 
    NEW.id, NEW.batch_id, NEW.batch_index, NEW.status;
  
  -- Update corresponding photoshoot entry if it exists
  UPDATE photoshoots
  SET 
    status = NEW.status,
    result_image_url = COALESCE(NEW.result_image_url, result_image_url),
    error_message = COALESCE(NEW.error_message, error_message),
    updated_at = NOW()
  WHERE 
    batch_id = NEW.batch_id AND 
    batch_index = NEW.batch_index AND
    status <> NEW.status;
  
  -- Get count of rows updated
  GET DIAGNOSTICS photoshoot_count = ROW_COUNT;
  
  -- Log the result for debugging
  RAISE LOG 'Updated % photoshoot(s) for task: %', photoshoot_count, NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on generation_tasks table
DO $$ 
BEGIN
  -- Check if trigger already exists and drop it if it does
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_photoshoot_on_task_update'
  ) THEN
    DROP TRIGGER update_photoshoot_on_task_update ON generation_tasks;
  END IF;
END $$;

CREATE TRIGGER update_photoshoot_on_task_update
AFTER UPDATE ON generation_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_photoshoot_from_task();

-- Ensure there are no orphaned processing photoshoots
-- This fixes any existing data issues
UPDATE photoshoots p
SET 
  status = t.status,
  result_image_url = COALESCE(t.result_image_url, p.result_image_url),
  error_message = COALESCE(t.error_message, p.error_message),
  updated_at = NOW()
FROM generation_tasks t
WHERE 
  p.batch_id = t.batch_id AND
  p.batch_index = t.batch_index AND
  p.status <> t.status AND
  t.status IN ('completed', 'failed');