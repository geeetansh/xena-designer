/*
  # Fix photoshoots synchronization

  1. Updates
    - Fix the trigger function that syncs photoshoots from generation tasks
    - Add a one-time query to repair existing inconsistent records
    
  2. Purpose
    - Ensure photoshoots are properly updated when their tasks complete
    - Fix any existing photoshoots stuck in "processing" state
*/

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS update_photoshoot_on_task_update ON generation_tasks;

-- Create improved trigger function to sync photoshoots from generation tasks
CREATE OR REPLACE FUNCTION sync_photoshoot_from_task()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if status changes to completed or failed
  IF NEW.status IN ('completed', 'failed') THEN
    -- Update the corresponding photoshoot
    UPDATE photoshoots
    SET 
      status = NEW.status,
      result_image_url = NEW.result_image_url,
      error_message = NEW.error_message,
      updated_at = NOW()
    WHERE 
      batch_id = NEW.batch_id AND 
      batch_index = NEW.batch_index;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER update_photoshoot_on_task_update
AFTER UPDATE ON generation_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_photoshoot_from_task();

-- Immediately fix any existing mismatches
UPDATE photoshoots p
SET 
  status = t.status,
  result_image_url = t.result_image_url,
  error_message = t.error_message,
  updated_at = NOW()
FROM generation_tasks t
WHERE 
  p.batch_id = t.batch_id AND
  p.batch_index = t.batch_index AND
  p.status = 'processing' AND
  t.status IN ('completed', 'failed');