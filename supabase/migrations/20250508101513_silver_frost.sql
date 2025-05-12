-- Drop existing functions first to avoid 'cannot change return type' errors
DROP FUNCTION IF EXISTS rescue_stuck_photoshoots();
DROP FUNCTION IF EXISTS detect_status_mismatches();

-- Create a function to rescue stuck photoshoots
CREATE OR REPLACE FUNCTION rescue_stuck_photoshoots()
RETURNS TABLE (
  photoshoot_id UUID,
  old_status TEXT,
  new_status TEXT
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
    
    IF t IS NULL THEN
      CONTINUE;  -- Skip if no task found
    END IF;
    
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
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create a function to detect mismatches between photoshoots and tasks
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

-- Run a one-time fix to correct any current issues
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