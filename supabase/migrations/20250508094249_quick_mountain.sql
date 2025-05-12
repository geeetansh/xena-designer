-- Create a migration to add additional logging and null checks to the sync_photoshoot_from_task function

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS update_photoshoot_on_task_update ON generation_tasks;

-- Create more robust trigger function with enhanced logging and null checks
CREATE OR REPLACE FUNCTION sync_photoshoot_from_task()
RETURNS TRIGGER AS $$
DECLARE
  updated_rows integer := 0;
  log_message text;
  has_photoshoots boolean := false;
BEGIN
  -- Guard against null inputs
  IF NEW IS NULL THEN
    RAISE LOG 'sync_photoshoot_from_task ERROR: NEW record is null';
    RETURN NULL;
  END IF;
  
  -- Guard against missing batch_id
  IF NEW.batch_id IS NULL THEN
    RAISE LOG 'sync_photoshoot_from_task: Task % has no batch_id, cannot sync to photoshoots', NEW.id;
    RETURN NEW;
  END IF;
  
  -- First check if there's any photoshoot to update
  SELECT EXISTS(
    SELECT 1 FROM photoshoots
    WHERE batch_id = NEW.batch_id AND batch_index = NEW.batch_index
  ) INTO has_photoshoots;
  
  -- If there are no photoshoots, log and exit
  IF NOT has_photoshoots THEN
    RAISE LOG 'sync_photoshoot_from_task: No photoshoots found for task % with batch_id=% and batch_index=%',
      NEW.id, NEW.batch_id, NEW.batch_index;
    RETURN NEW;
  END IF;
  
  -- Extensive logging at the start of the function
  RAISE LOG 'sync_photoshoot_from_task triggered: task_id=%, old_status=%, new_status=%, batch_id=%, batch_index=%, has_result=%', 
    NEW.id, 
    COALESCE(OLD.status, 'NULL'), 
    COALESCE(NEW.status, 'NULL'), 
    NEW.batch_id, 
    NEW.batch_index,
    (NEW.result_image_url IS NOT NULL);
    
  -- Only proceed if status has changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Add to log message
    log_message := format('Task %s status changed from %s to %s', 
      NEW.id, 
      COALESCE(OLD.status, 'NULL'), 
      COALESCE(NEW.status, 'NULL'));
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
        (SELECT json_agg(row_to_json(p)) FROM 
          (SELECT id, status, batch_index FROM photoshoots 
           WHERE batch_id = NEW.batch_id) p);
    END IF;
  ELSE
    RAISE LOG 'No status change detected for task_id=%, keeping status=%', NEW.id, NEW.status;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log any exceptions that occur during execution
  RAISE LOG 'ERROR in sync_photoshoot_from_task: task_id=%, error=%, stack=%', 
    NEW.id, SQLERRM, pg_exception_context();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger again
CREATE TRIGGER update_photoshoot_on_task_update
AFTER UPDATE ON generation_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_photoshoot_from_task();

-- Let's also fix any currently stuck photoshoots
DO $$
DECLARE
  fixed_count integer;
BEGIN
  -- Fix any stuck "processing" photoshoots with a corresponding task that's completed or failed
  WITH fixed AS (
    UPDATE photoshoots p
    SET 
      status = t.status,
      result_image_url = t.result_image_url,
      error_message = t.error_message,
      updated_at = NOW()
    FROM generation_tasks t
    WHERE 
      p.batch_id = t.batch_id 
      AND p.batch_index = t.batch_index
      AND p.status = 'processing'
      AND t.status IN ('completed', 'failed')
    RETURNING p.id
  )
  SELECT COUNT(*) INTO fixed_count FROM fixed;
  
  RAISE NOTICE 'Fixed % stuck photoshoots', fixed_count;
  RAISE LOG 'Fixed % stuck photoshoots', fixed_count;
END $$;