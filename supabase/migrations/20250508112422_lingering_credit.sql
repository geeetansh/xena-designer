/*
  # Enhanced Photoshoot Synchronization

  1. Improvements
    - Completely redesign the sync_photoshoot_from_task function
    - Handle ALL status changes between generation_tasks and photoshoots
    - Add comprehensive error handling and logging
    
  2. Purpose
    - Provide reliable, automatic synchronization between tasks and photoshoots
    - Eliminate the need for manual repair functions
    - Fix the root cause of stuck photoshoots instead of just symptoms
*/

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS update_photoshoot_on_task_update ON generation_tasks;

-- Create a much improved trigger function to sync photoshoots from generation tasks
CREATE OR REPLACE FUNCTION sync_photoshoot_from_task()
RETURNS TRIGGER AS $$
DECLARE
  updated_rows integer := 0;
  log_prefix text := 'PHOTOSHOOT_SYNC';
BEGIN
  -- Guard against null values
  IF NEW IS NULL THEN
    RAISE LOG '%: ERROR - NEW record is null', log_prefix;
    RETURN NULL;
  END IF;

  -- Skip if neither status nor result_image_url changed (avoid unnecessary updates)
  IF OLD.status = NEW.status AND OLD.result_image_url IS NOT DISTINCT FROM NEW.result_image_url THEN
    RETURN NEW;
  END IF;
  
  -- Guard against missing batch_id
  IF NEW.batch_id IS NULL THEN
    RAISE LOG '%: Task % has no batch_id, cannot sync', log_prefix, NEW.id;
    RETURN NEW;
  END IF;

  -- Log the status change
  RAISE LOG '%: Task % status changed from % to %, batch=%', 
    log_prefix, NEW.id, COALESCE(OLD.status, 'NULL'), NEW.status, NEW.batch_id;
  
  -- Update the corresponding photoshoot with any changed values
  UPDATE photoshoots
  SET 
    -- Always sync status
    status = NEW.status,
    
    -- Only update result_image_url if it changed and is not null
    result_image_url = CASE
      WHEN NEW.result_image_url IS NOT NULL AND 
           (OLD.result_image_url IS NULL OR OLD.result_image_url != NEW.result_image_url)
      THEN NEW.result_image_url
      ELSE result_image_url
    END,
    
    -- Only update error_message if it changed and is not null
    error_message = CASE
      WHEN NEW.error_message IS NOT NULL AND
           (OLD.error_message IS NULL OR OLD.error_message != NEW.error_message)
      THEN NEW.error_message
      ELSE error_message
    END,
    
    updated_at = NOW()
  WHERE 
    -- Match by both batch_id/index and variation_group_id/index to cover all cases
    (
      (batch_id = NEW.batch_id AND batch_index = NEW.batch_index)
      OR
      (variation_group_id = NEW.batch_id AND variation_index = NEW.batch_index)
    );

  -- Get number of affected rows for logging
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  
  RAISE LOG '%: Updated % photoshoots for task %', log_prefix, updated_rows, NEW.id;

  -- If no rows were updated, something might be wrong - log details for debugging
  IF updated_rows = 0 THEN
    RAISE LOG '%: WARNING - No photoshoots found for task % (batch_id=%, batch_index=%)', 
      log_prefix, NEW.id, NEW.batch_id, NEW.batch_index;
      
    -- Log existing photoshoots with this batch_id to help debugging
    RAISE LOG '%: Existing photoshoots with batch_id=%: %', 
      log_prefix, NEW.batch_id, 
      (SELECT json_agg(row_to_json(p)) FROM 
        (SELECT id, status, batch_id, batch_index, variation_group_id, variation_index FROM photoshoots 
         WHERE batch_id = NEW.batch_id OR variation_group_id = NEW.batch_id) p);
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log any exceptions that occur during execution
  RAISE LOG '%: ERROR in sync function for task %: %', log_prefix, NEW.id, SQLERRM;
  RAISE LOG '%: Error context: %', log_prefix, pg_exception_context();
  -- Don't rethrow the error - we want the trigger to continue even if there's an error
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger again, to fire on ALL status changes
CREATE TRIGGER update_photoshoot_on_task_update
AFTER UPDATE ON generation_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_photoshoot_from_task();

-- Create a simplified repair function that can be called manually if needed
CREATE OR REPLACE FUNCTION repair_single_photoshoot(photoshoot_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  p RECORD;
  t RECORD;
  success BOOLEAN := FALSE;
  log_prefix text := 'PHOTOSHOOT_REPAIR';
BEGIN
  -- Get the photoshoot
  SELECT * INTO p FROM photoshoots WHERE id = photoshoot_id;
  IF p IS NULL THEN
    RAISE LOG '%: Photoshoot % not found', log_prefix, photoshoot_id;
    RETURN FALSE;
  END IF;
  
  -- First try to find task by batch_id/batch_index
  SELECT * INTO t FROM generation_tasks
  WHERE batch_id = p.batch_id AND batch_index = p.batch_index
  LIMIT 1;
  
  -- If not found, try by variation_group_id/variation_index
  IF t IS NULL AND p.variation_group_id IS NOT NULL THEN
    SELECT * INTO t FROM generation_tasks
    WHERE batch_id = p.variation_group_id AND batch_index = p.variation_index
    LIMIT 1;
  END IF;
  
  IF t IS NULL THEN
    RAISE LOG '%: No matching task found for photoshoot %', log_prefix, photoshoot_id;
    RETURN FALSE;
  END IF;
  
  -- Only update if the status is different
  IF p.status = t.status THEN
    RAISE LOG '%: Photoshoot % already has correct status %', log_prefix, photoshoot_id, p.status;
    RETURN TRUE; -- Already in sync, consider it successful
  END IF;
  
  -- Update the photoshoot based on the task
  UPDATE photoshoots
  SET 
    status = t.status,
    result_image_url = COALESCE(t.result_image_url, result_image_url),
    error_message = COALESCE(t.error_message, error_message),
    updated_at = NOW()
  WHERE id = photoshoot_id;
  
  RAISE LOG '%: Successfully repaired photoshoot % from status % to %', 
    log_prefix, photoshoot_id, p.status, t.status;
  
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '%: Error repairing photoshoot %: %', log_prefix, photoshoot_id, SQLERRM;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Fix any existing stuck photoshoots as a one-time cleanup
DO $$
DECLARE
  fixed_count integer := 0;
  p record;
BEGIN
  -- Run a one-time fix on any photoshoots that should be completed or failed
  -- but are still stuck in 'processing' state
  FOR p IN
    SELECT ph.id
    FROM photoshoots ph
    JOIN generation_tasks gt ON 
      (ph.batch_id = gt.batch_id AND ph.batch_index = gt.batch_index)
      OR (ph.variation_group_id = gt.batch_id AND ph.variation_index = gt.batch_index)
    WHERE ph.status = 'processing' 
      AND gt.status IN ('completed', 'failed')
  LOOP
    IF repair_single_photoshoot(p.id) THEN
      fixed_count := fixed_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Fixed % stuck photoshoots during migration', fixed_count;
END $$;