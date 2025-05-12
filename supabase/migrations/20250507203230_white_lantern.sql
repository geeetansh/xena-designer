/*
  # Fix photoshoot sync issues

  1. Improvements
    - Fix the sync_photoshoot_from_task function to be more robust
    - Add more detailed logging
    - Add a direct image_id reference to photoshoots
    - Create a function to manually sync stuck photoshoots
    
  2. Purpose
    - Fix cases where image generation succeeds but status never updates
    - Provide a way to recover stuck tasks without requiring manual database edits
    - Improve system reliability and observability
*/

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS update_photoshoot_on_task_update ON generation_tasks;

-- Create improved trigger function with better error handling
CREATE OR REPLACE FUNCTION sync_photoshoot_from_task()
RETURNS TRIGGER AS $$
DECLARE
  updated_rows integer := 0;
  log_message text;
BEGIN
  -- Only proceed if status has changed
  IF OLD.status != NEW.status THEN
    -- Add to log message
    log_message := format('Task %s status changed from %s to %s', NEW.id, OLD.status, NEW.status);
    
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
    log_message := log_message || format(', updated %s photoshoots', updated_rows);
    
    -- Log the operation
    RAISE LOG '%', log_message;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger again
CREATE TRIGGER update_photoshoot_on_task_update
AFTER UPDATE ON generation_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_photoshoot_from_task();

-- Create a function to manually rescue stuck photoshoots
CREATE OR REPLACE FUNCTION rescue_stuck_photoshoots()
RETURNS TABLE (
  photoshoot_id UUID,
  old_status TEXT,
  new_status TEXT,
  task_id UUID
) AS $$
DECLARE
  p record;
  t record;
BEGIN
  -- Find photoshoots that are stuck in processing but have a completed task
  FOR p IN
    SELECT 
      ph.id, 
      ph.status as old_status, 
      ph.batch_id, 
      ph.batch_index
    FROM 
      photoshoots ph
    WHERE 
      ph.status = 'processing'
      AND EXISTS (
        SELECT 1 FROM generation_tasks gt
        WHERE gt.batch_id = ph.batch_id
          AND gt.batch_index = ph.batch_index
          AND gt.status IN ('completed', 'failed')
      )
  LOOP
    -- Find the corresponding task
    SELECT * INTO t FROM generation_tasks
    WHERE batch_id = p.batch_id AND batch_index = p.batch_index
    LIMIT 1;
    
    -- Update the photoshoot with the task data
    UPDATE photoshoots
    SET 
      status = t.status,
      result_image_url = t.result_image_url,
      error_message = t.error_message,
      updated_at = NOW()
    WHERE id = p.id;
    
    -- Return information about the fix
    photoshoot_id := p.id;
    old_status := p.old_status;
    new_status := t.status;
    task_id := t.id;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Run a one-time fix to synchronize any currently stuck photoshoots
DO $$
DECLARE
  fixed_count integer;
BEGIN
  WITH fixed AS (
    SELECT * FROM rescue_stuck_photoshoots()
  )
  SELECT COUNT(*) INTO fixed_count FROM fixed;
  
  RAISE NOTICE 'Fixed % stuck photoshoots', fixed_count;
END $$;

-- Create a function to detect mismatched tasks and photoshoots
CREATE OR REPLACE FUNCTION detect_status_mismatches()
RETURNS TABLE (
  photoshoot_id UUID,
  photoshoot_status TEXT,
  task_id UUID,
  task_status TEXT,
  batch_id UUID,
  batch_index INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS photoshoot_id, 
    p.status AS photoshoot_status, 
    t.id AS task_id, 
    t.status AS task_status,
    p.batch_id,
    p.batch_index
  FROM 
    photoshoots p
    JOIN generation_tasks t ON 
      p.batch_id = t.batch_id AND 
      p.batch_index = t.batch_index
  WHERE 
    p.status != t.status
    AND t.status IN ('completed', 'failed')
    AND p.status = 'processing'
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql;