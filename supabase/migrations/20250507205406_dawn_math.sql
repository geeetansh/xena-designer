/*
  # Enhanced logging for photoshoot synchronization

  1. Updates
    - Add extensive logging to sync_photoshoot_from_task function
    - Remove any obsolete functions and triggers
    
  2. Purpose
    - Improve debuggability of the photoshoot synchronization process
    - Identify when and why photoshoots aren't being properly updated
    - Track the flow of state changes through the system
*/

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS update_photoshoot_on_task_update ON generation_tasks;

-- Create improved trigger function with enhanced logging
CREATE OR REPLACE FUNCTION sync_photoshoot_from_task()
RETURNS TRIGGER AS $$
DECLARE
  updated_rows integer := 0;
  log_message text;
BEGIN
  -- Extensive logging at the start of the function
  RAISE LOG 'sync_photoshoot_from_task triggered: task_id=%, old_status=%, new_status=%, batch_id=%, batch_index=%', 
    NEW.id, OLD.status, NEW.status, NEW.batch_id, NEW.batch_index;
    
  -- Only proceed if status has changed
  IF OLD.status != NEW.status THEN
    -- Add to log message
    log_message := format('Task %s status changed from %s to %s', NEW.id, OLD.status, NEW.status);
    RAISE LOG '%', log_message;
    
    -- Update the corresponding photoshoot
    UPDATE photoshoots
    SET 
      status = NEW.status,
      result_image_url = COALESCE(NEW.result_image_url, result_image_url),
      error_message = COALESCE(NEW.error_message, error_message),
      updated_at = NOW()
    WHERE 
      batch_id = NEW.batch_id AND 
      batch_index = NEW.batch_index;
    
    -- Get number of affected rows
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    RAISE LOG 'Photoshoot update results: rows_updated=%, batch_id=%, batch_index=%', 
      updated_rows, NEW.batch_id, NEW.batch_index;
    
    -- Additional logging if no rows were updated (indicates a problem)
    IF updated_rows = 0 THEN
      RAISE LOG 'WARNING: No photoshoot was updated for task_id=%, batch_id=%, batch_index=%', 
        NEW.id, NEW.batch_id, NEW.batch_index;
      
      -- Log all photoshoots with this batch_id for debugging
      RAISE LOG 'Photoshoots with batch_id=%: %', 
        NEW.batch_id, 
        (SELECT array_agg(id || ':' || status) FROM photoshoots WHERE batch_id = NEW.batch_id);
    END IF;
  ELSE
    RAISE LOG 'No status change detected for task_id=%, keeping status=%', NEW.id, NEW.status;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log any exceptions that occur during execution
  RAISE LOG 'ERROR in sync_photoshoot_from_task: task_id=%, error=%', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger again
CREATE TRIGGER update_photoshoot_on_task_update
AFTER UPDATE ON generation_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_photoshoot_from_task();

-- Run a one-time fix to make sure processing photoshoots are properly updated
-- This addresses any existing issues with processing photoshoots
UPDATE photoshoots p
SET 
  status = t.status,
  result_image_url = COALESCE(t.result_image_url, p.result_image_url),
  error_message = COALESCE(t.error_message, p.error_message),
  updated_at = NOW()
FROM generation_tasks t
WHERE 
  p.batch_id = t.batch_id 
  AND p.batch_index = t.batch_index
  AND p.status = 'processing'
  AND t.status IN ('completed', 'failed');