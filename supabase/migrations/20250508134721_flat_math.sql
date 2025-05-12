/*
  # Bidirectional synchronization between images and photoshoots tables

  1. New Triggers
    - `update_photoshoot_from_image` - Trigger on images table to update photoshoots when new images are added
    
  2. Improved Functions
    - Add direct sync path from images to photoshoots
    - Create diagnostic views for monitoring any sync issues
    
  3. Purpose
    - Ensure robust synchronization between images and photoshoots
    - Add redundancy to prevent photoshoots from getting stuck
    - Provide better visibility into the system state
*/

-- Create a trigger function to update photoshoots when a new image is added
CREATE OR REPLACE FUNCTION update_photoshoot_from_image()
RETURNS TRIGGER AS $$
DECLARE
  updated_rows integer := 0;
  log_prefix text := 'IMAGE_TO_PHOTOSHOOT_SYNC';
BEGIN
  -- Only proceed if this is a new image or the URL has changed
  IF TG_OP = 'INSERT' OR NEW.url != OLD.url THEN
    RAISE LOG '%: Processing image %: variation_group_id=%, variation_index=%', 
      log_prefix, NEW.id, NEW.variation_group_id, NEW.variation_index;
    
    -- First attempt: Update photoshoots using variation_group_id and variation_index
    IF NEW.variation_group_id IS NOT NULL AND NEW.variation_index IS NOT NULL THEN
      UPDATE photoshoots
      SET 
        status = 'completed',
        result_image_url = NEW.url,
        updated_at = NOW()
      WHERE 
        variation_group_id = NEW.variation_group_id AND 
        variation_index = NEW.variation_index AND
        status = 'processing';
        
      GET DIAGNOSTICS updated_rows = ROW_COUNT;
      
      IF updated_rows > 0 THEN
        RAISE LOG '%: Updated % photoshoots using variation IDs for image %', 
          log_prefix, updated_rows, NEW.id;
        RETURN NEW;
      END IF;
    END IF;
    
    -- Second attempt: Try with batch_id matching variation_group_id
    IF NEW.variation_group_id IS NOT NULL THEN
      UPDATE photoshoots
      SET 
        status = 'completed',
        result_image_url = NEW.url,
        updated_at = NOW()
      WHERE 
        batch_id = NEW.variation_group_id AND 
        batch_index = NEW.variation_index AND
        status = 'processing';
        
      GET DIAGNOSTICS updated_rows = ROW_COUNT;
      
      IF updated_rows > 0 THEN
        RAISE LOG '%: Updated % photoshoots using batch IDs for image %', 
          log_prefix, updated_rows, NEW.id;
        RETURN NEW;
      END IF;
    END IF;
    
    -- If we got here, we couldn't find a photoshoot to update
    RAISE LOG '%: Could not find photoshoot for image %', log_prefix, NEW.id;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '%: Error processing image %: %', log_prefix, NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger on the images table
DROP TRIGGER IF EXISTS update_photoshoot_from_image ON images;
CREATE TRIGGER update_photoshoot_from_image
AFTER INSERT OR UPDATE ON images
FOR EACH ROW
EXECUTE FUNCTION update_photoshoot_from_image();

-- Create a comprehensive function to sync all photoshoots with their images
CREATE OR REPLACE FUNCTION full_sync_photoshoots_with_images()
RETURNS TABLE(
  photoshoot_id UUID,
  old_status TEXT,
  new_status TEXT,
  sync_source TEXT,
  sync_type TEXT
) AS $$
DECLARE
  ps record;
  img record;
  task record;
  log_prefix text := 'FULL_SYNC';
BEGIN
  -- Stage 1: Find all processing photoshoots with a matching image by variation IDs
  FOR ps IN
    SELECT p.*
    FROM photoshoots p
    WHERE p.status = 'processing'
      AND p.variation_group_id IS NOT NULL
      AND p.variation_index IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM images i
        WHERE i.variation_group_id = p.variation_group_id
          AND i.variation_index = p.variation_index
      )
  LOOP
    -- Get the matching image
    SELECT * INTO img
    FROM images i
    WHERE i.variation_group_id = ps.variation_group_id
      AND i.variation_index = ps.variation_index
    LIMIT 1;
    
    IF img IS NOT NULL THEN
      UPDATE photoshoots
      SET 
        status = 'completed',
        result_image_url = img.url,
        updated_at = NOW()
      WHERE id = ps.id;
      
      photoshoot_id := ps.id;
      old_status := ps.status;
      new_status := 'completed';
      sync_source := 'image';
      sync_type := 'variation_match';
      
      RAISE LOG '%: Synced photoshoot % using image %', log_prefix, ps.id, img.id;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  -- Stage 2: Find all processing photoshoots with a matching task by batch IDs
  FOR ps IN
    SELECT p.*
    FROM photoshoots p
    WHERE p.status = 'processing'
      AND p.batch_id IS NOT NULL
      AND p.batch_index IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM generation_tasks t
        WHERE t.batch_id = p.batch_id
          AND t.batch_index = p.batch_index
          AND t.status IN ('completed', 'failed')
      )
  LOOP
    -- Get the matching task
    SELECT * INTO task
    FROM generation_tasks t
    WHERE t.batch_id = ps.batch_id
      AND t.batch_index = ps.batch_index
      AND t.status IN ('completed', 'failed')
    LIMIT 1;
    
    IF task IS NOT NULL THEN
      UPDATE photoshoots
      SET 
        status = task.status,
        result_image_url = task.result_image_url,
        error_message = task.error_message,
        updated_at = NOW()
      WHERE id = ps.id;
      
      photoshoot_id := ps.id;
      old_status := ps.status;
      new_status := task.status;
      sync_source := 'task';
      sync_type := 'batch_match';
      
      RAISE LOG '%: Synced photoshoot % using task %', log_prefix, ps.id, task.id;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  -- Stage 3: Fix any photoshoots that are stuck for too long with no matching task or image
  FOR ps IN
    SELECT p.*
    FROM photoshoots p
    WHERE p.status = 'processing'
      AND p.created_at < NOW() - INTERVAL '30 minutes' -- only fix old stuck ones
      AND NOT EXISTS (
        -- No matching task
        SELECT 1 FROM generation_tasks t
        WHERE (t.batch_id = p.batch_id AND t.batch_index = p.batch_index)
          OR (t.batch_id = p.variation_group_id AND t.batch_index = p.variation_index)
      )
      AND NOT EXISTS (
        -- No matching image
        SELECT 1 FROM images i 
        WHERE (i.variation_group_id = p.variation_group_id AND i.variation_index = p.variation_index)
      )
  LOOP
    -- Mark as failed
    UPDATE photoshoots
    SET 
      status = 'failed',
      error_message = 'Auto-marked as failed: no matching task or image found after 30+ minutes',
      updated_at = NOW()
    WHERE id = ps.id;
    
    photoshoot_id := ps.id;
    old_status := ps.status;
    new_status := 'failed';
    sync_source := 'system';
    sync_type := 'timeout';
    
    RAISE LOG '%: Marked photoshoot % as failed due to timeout', log_prefix, ps.id;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create a function to diagnose specific photoshoots
CREATE OR REPLACE FUNCTION diagnose_photoshoot(photoshoot_id UUID)
RETURNS TABLE (
  photoshoot_data JSONB,
  matching_tasks JSONB,
  matching_images JSONB,
  recommended_action TEXT
) AS $$
DECLARE
  ps record;
  tasks jsonb;
  images jsonb;
  action text;
BEGIN
  -- Get the photoshoot
  SELECT row_to_json(p)::jsonb INTO ps 
  FROM photoshoots p
  WHERE p.id = photoshoot_id;
  
  IF ps IS NULL THEN
    RETURN QUERY SELECT 
      jsonb_build_object('error', 'Photoshoot not found'),
      NULL::jsonb,
      NULL::jsonb,
      'Check ID and try again';
    RETURN;
  END IF;
  
  -- Find matching generation tasks
  SELECT jsonb_agg(row_to_json(t)::jsonb) INTO tasks
  FROM generation_tasks t
  WHERE (t.batch_id = (ps->>'batch_id')::uuid AND t.batch_index = (ps->>'batch_index')::int)
     OR (t.batch_id = (ps->>'variation_group_id')::uuid AND t.batch_index = (ps->>'variation_index')::int);
  
  -- Find matching images  
  SELECT jsonb_agg(row_to_json(i)::jsonb) INTO images
  FROM images i
  WHERE (i.variation_group_id = (ps->>'variation_group_id')::uuid AND i.variation_index = (ps->>'variation_index')::int)
     OR (i.url = (ps->>'result_image_url'));
  
  -- Determine recommended action
  IF ps->>'status' = 'completed' THEN
    action := 'No action needed - photoshoot is already completed';
  ELSIF ps->>'status' = 'failed' THEN
    action := 'No action needed - photoshoot has failed';
  ELSIF ps->>'status' = 'processing' AND tasks IS NULL THEN
    action := 'Mark as failed - no matching tasks found';
  ELSIF ps->>'status' = 'processing' AND images IS NOT NULL THEN
    action := 'Mark as completed - matching image found';
  ELSIF ps->>'status' = 'processing' AND (tasks->0->>'status') = 'completed' THEN
    action := 'Mark as completed based on completed task';
  ELSIF ps->>'status' = 'processing' AND (tasks->0->>'status') = 'failed' THEN
    action := 'Mark as failed based on failed task';
  ELSE
    action := 'Continue monitoring - still processing';
  END IF;
  
  RETURN QUERY SELECT ps, tasks, images, action;
END;
$$ LANGUAGE plpgsql;

-- Create indexes to improve performance
CREATE INDEX IF NOT EXISTS photoshoots_result_image_url_idx ON photoshoots(result_image_url);

-- Create a view for understanding all matching records across tables
CREATE OR REPLACE VIEW photoshoot_sync_status AS
SELECT 
  p.id AS photoshoot_id,
  p.name,
  p.status AS photoshoot_status,
  p.batch_id,
  p.batch_index,
  p.variation_group_id,
  p.variation_index,
  t.id AS task_id,
  t.status AS task_status,
  i.id AS image_id,
  i.url AS image_url,
  CASE 
    WHEN p.status = 'completed' THEN TRUE
    WHEN p.status = 'failed' THEN TRUE
    WHEN t.status = 'completed' AND p.status != 'completed' THEN FALSE
    WHEN t.status = 'failed' AND p.status != 'failed' THEN FALSE
    WHEN i.id IS NOT NULL AND p.status != 'completed' THEN FALSE
    ELSE TRUE
  END AS is_in_sync,
  NOW() - p.updated_at AS time_since_update
FROM photoshoots p
LEFT JOIN generation_tasks t ON
  (t.batch_id = p.batch_id AND t.batch_index = p.batch_index)
  OR (t.batch_id = p.variation_group_id AND t.batch_index = p.variation_index)
LEFT JOIN images i ON
  (i.variation_group_id = p.variation_group_id AND i.variation_index = p.variation_index)
  OR (i.url = p.result_image_url)
WHERE 
  p.created_at > NOW() - INTERVAL '7 days' -- Limit to recent photoshoots
ORDER BY p.created_at DESC;

-- Run an initial sync to fix any current issues
DO $$
DECLARE
  fixed_count integer;
BEGIN
  WITH fixed AS (
    SELECT * FROM full_sync_photoshoots_with_images()
  )
  SELECT COUNT(*) INTO fixed_count FROM fixed;
  
  RAISE NOTICE 'Fixed % photoshoots with full sync', fixed_count;
END $$;