/*
  # Improved Photoshoot Repair Functions
  
  1. New Functions
    - `repair_single_photoshoot` - Fixes a specific photoshoot by ID
    - `fix_orphaned_photoshoots` - Fixes photoshoots without matching tasks
    - `full_sync_photoshoots_with_images` - Complete sync between images and photoshoots

  2. New Views
    - `stuck_photoshoots` - Identifies stuck photoshoots for monitoring
    
  3. Purpose
    - Provide robust repair mechanisms for photoshoots
    - Fix edge cases where photoshoots get stuck in processing state
    - Enable manual and automatic recovery from synchronization issues
*/

-- Drop existing functions to avoid return type errors
DROP FUNCTION IF EXISTS repair_single_photoshoot(UUID);
DROP FUNCTION IF EXISTS fix_orphaned_photoshoots();
DROP FUNCTION IF EXISTS full_sync_photoshoots_with_images();
DROP VIEW IF EXISTS stuck_photoshoots;

-- Create a function to repair a specific photoshoot
CREATE OR REPLACE FUNCTION repair_single_photoshoot(photoshoot_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  p RECORD;
  t RECORD;
  i RECORD;
  success BOOLEAN := FALSE;
  log_prefix text := 'PHOTOSHOOT_REPAIR';
BEGIN
  -- Get the photoshoot
  SELECT * INTO p FROM photoshoots WHERE id = photoshoot_id;
  IF p IS NULL THEN
    RAISE LOG '%: Photoshoot % not found', log_prefix, photoshoot_id;
    RETURN FALSE;
  END IF;
  
  -- Only repair processing photoshoots
  IF p.status != 'processing' THEN
    RAISE LOG '%: Photoshoot % is not in processing state (current status: %)', 
      log_prefix, photoshoot_id, p.status;
    RETURN TRUE; -- Already in a final state, nothing to repair
  END IF;
  
  -- First try: Check if there's a matching image using variation IDs
  IF p.variation_group_id IS NOT NULL AND p.variation_index IS NOT NULL THEN
    SELECT * INTO i FROM images
    WHERE variation_group_id = p.variation_group_id AND variation_index = p.variation_index
    LIMIT 1;
    
    IF i IS NOT NULL THEN
      UPDATE photoshoots
      SET 
        status = 'completed',
        result_image_url = i.url,
        updated_at = NOW()
      WHERE id = photoshoot_id;
      
      RAISE LOG '%: Repaired photoshoot % using image %', log_prefix, photoshoot_id, i.id;
      RETURN TRUE;
    END IF;
  END IF;
  
  -- Second try: Check if there's a matching task
  -- First with variation IDs
  IF p.variation_group_id IS NOT NULL AND p.variation_index IS NOT NULL THEN
    SELECT * INTO t FROM generation_tasks
    WHERE batch_id = p.variation_group_id AND batch_index = p.variation_index
    LIMIT 1;
    
    IF t IS NOT NULL THEN
      UPDATE photoshoots
      SET 
        status = t.status,
        result_image_url = t.result_image_url,
        error_message = t.error_message,
        updated_at = NOW()
      WHERE id = photoshoot_id;
      
      RAISE LOG '%: Repaired photoshoot % using task % (variation match)', 
        log_prefix, photoshoot_id, t.id;
      RETURN TRUE;
    END IF;
  END IF;
  
  -- Then try with batch IDs
  IF p.batch_id IS NOT NULL AND p.batch_index IS NOT NULL THEN
    SELECT * INTO t FROM generation_tasks
    WHERE batch_id = p.batch_id AND batch_index = p.batch_index
    LIMIT 1;
    
    IF t IS NOT NULL THEN
      UPDATE photoshoots
      SET 
        status = t.status,
        result_image_url = t.result_image_url,
        error_message = t.error_message,
        updated_at = NOW()
      WHERE id = photoshoot_id;
      
      RAISE LOG '%: Repaired photoshoot % using task % (batch match)', 
        log_prefix, photoshoot_id, t.id;
      RETURN TRUE;
    END IF;
  END IF;
  
  -- If we get here, we couldn't find a matching task or image
  -- If the photoshoot is stuck for more than 15 minutes, mark it as failed
  IF p.updated_at < NOW() - INTERVAL '15 minutes' THEN
    UPDATE photoshoots
    SET 
      status = 'failed',
      error_message = 'Automatically marked as failed after 15 minutes with no progress',
      updated_at = NOW()
    WHERE id = photoshoot_id;
    
    RAISE LOG '%: Marked photoshoot % as failed due to timeout', log_prefix, photoshoot_id;
    RETURN TRUE;
  END IF;
  
  RAISE LOG '%: Could not repair photoshoot %', log_prefix, photoshoot_id;
  RETURN FALSE;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '%: Error repairing photoshoot %: %', log_prefix, photoshoot_id, SQLERRM;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Create a function to fix orphaned photoshoots (with no matching tasks)
CREATE OR REPLACE FUNCTION fix_orphaned_photoshoots()
RETURNS TABLE (
  photoshoot_id UUID,
  old_status TEXT,
  new_status TEXT,
  fix_type TEXT
) AS $$
DECLARE
  p RECORD;
  i RECORD;
  log_prefix text := 'ORPHANED_PHOTOSHOOT_FIX';
BEGIN
  -- Find all photoshoots that are in 'processing' state but have no matching tasks
  FOR p IN
    SELECT ph.*
    FROM photoshoots ph
    WHERE ph.status = 'processing'
      AND NOT EXISTS (
        SELECT 1 FROM generation_tasks t
        WHERE (t.batch_id = ph.batch_id AND t.batch_index = ph.batch_index)
          OR (t.batch_id = ph.variation_group_id AND t.batch_index = ph.variation_index)
      )
  LOOP
    -- First try: Check if there's a matching image by URL pattern
    -- This can happen if the image was generated but the task was lost
    IF p.variation_group_id IS NOT NULL AND p.variation_index IS NOT NULL THEN
      SELECT * INTO i FROM images
      WHERE variation_group_id = p.variation_group_id AND variation_index = p.variation_index
      LIMIT 1;
      
      IF i IS NOT NULL THEN
        UPDATE photoshoots
        SET 
          status = 'completed',
          result_image_url = i.url,
          updated_at = NOW()
        WHERE id = p.id;
        
        photoshoot_id := p.id;
        old_status := p.status;
        new_status := 'completed';
        fix_type := 'matched_image';
        
        RAISE LOG '%: Fixed orphaned photoshoot % with image %', log_prefix, p.id, i.id;
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;
    
    -- If more than 15 minutes old and no image or task, mark as failed
    IF p.updated_at < NOW() - INTERVAL '15 minutes' THEN
      UPDATE photoshoots
      SET 
        status = 'failed',
        error_message = 'Automatically marked as failed: no matching generation task found',
        updated_at = NOW()
      WHERE id = p.id;
      
      photoshoot_id := p.id;
      old_status := p.status;
      new_status := 'failed';
      fix_type := 'timeout';
      
      RAISE LOG '%: Marked orphaned photoshoot % as failed due to timeout', log_prefix, p.id;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Define a view to help identify stuck photoshoots
CREATE OR REPLACE VIEW stuck_photoshoots AS
SELECT 
  p.id,
  p.name,
  p.status,
  p.batch_id,
  p.batch_index,
  p.variation_group_id,
  p.variation_index,
  p.created_at,
  p.updated_at,
  NOW() - p.updated_at AS time_since_update,
  EXISTS (
    SELECT 1 FROM generation_tasks t 
    WHERE (t.batch_id = p.batch_id AND t.batch_index = p.batch_index)
      OR (t.batch_id = p.variation_group_id AND t.batch_index = p.variation_index)
  ) AS has_matching_task,
  EXISTS (
    SELECT 1 FROM images i
    WHERE (i.variation_group_id = p.variation_group_id AND i.variation_index = p.variation_index)
  ) AS has_matching_image
FROM photoshoots p
WHERE p.status = 'processing'
  AND p.updated_at < NOW() - INTERVAL '3 minutes';

-- Create a simplified version of the full sync function that the frontend will call
CREATE OR REPLACE FUNCTION full_sync_photoshoots_with_images()
RETURNS TABLE (
  photoshoot_id UUID,
  old_status TEXT,
  new_status TEXT,
  fix_type TEXT
) AS $$
DECLARE
  orphaned_fixes RECORD;
  fixed_count INTEGER := 0;
  log_prefix TEXT := 'FULL_SYNC';
BEGIN
  RAISE LOG '%: Starting full sync between images and photoshoots', log_prefix;
  
  -- First, fix any orphaned photoshoots
  FOR orphaned_fixes IN SELECT * FROM fix_orphaned_photoshoots()
  LOOP
    photoshoot_id := orphaned_fixes.photoshoot_id;
    old_status := orphaned_fixes.old_status;
    new_status := orphaned_fixes.new_status;
    fix_type := orphaned_fixes.fix_type;
    
    fixed_count := fixed_count + 1;
    RETURN NEXT;
  END LOOP;
  
  -- Then, fix any stuck processing photoshoots with completed tasks
  FOR photoshoot_id, old_status IN
    SELECT p.id, p.status
    FROM photoshoots p
    JOIN generation_tasks t ON 
      (t.batch_id = p.batch_id AND t.batch_index = p.batch_index)
      OR (t.batch_id = p.variation_group_id AND t.batch_index = p.variation_index)
    WHERE p.status = 'processing'
      AND t.status = 'completed'
      AND t.result_image_url IS NOT NULL
  LOOP
    -- Update the photoshoot with the task's result
    UPDATE photoshoots p
    SET 
      status = 'completed',
      result_image_url = t.result_image_url,
      updated_at = NOW()
    FROM generation_tasks t
    WHERE p.id = photoshoot_id
      AND (
        (t.batch_id = p.batch_id AND t.batch_index = p.batch_index)
        OR (t.batch_id = p.variation_group_id AND t.batch_index = p.variation_index)
      )
      AND t.status = 'completed';
    
    new_status := 'completed';
    fix_type := 'completed_task';
    
    RAISE LOG '%: Fixed stuck photoshoot % using completed task', log_prefix, photoshoot_id;
    fixed_count := fixed_count + 1;
    RETURN NEXT;
  END LOOP;
  
  -- Fix any stuck processing photoshoots with failed tasks
  FOR photoshoot_id, old_status IN
    SELECT p.id, p.status
    FROM photoshoots p
    JOIN generation_tasks t ON 
      (t.batch_id = p.batch_id AND t.batch_index = p.batch_index)
      OR (t.batch_id = p.variation_group_id AND t.batch_index = p.variation_index)
    WHERE p.status = 'processing'
      AND t.status = 'failed'
  LOOP
    -- Update the photoshoot with the task's error
    UPDATE photoshoots p
    SET 
      status = 'failed',
      error_message = t.error_message,
      updated_at = NOW()
    FROM generation_tasks t
    WHERE p.id = photoshoot_id
      AND (
        (t.batch_id = p.batch_id AND t.batch_index = p.batch_index)
        OR (t.batch_id = p.variation_group_id AND t.batch_index = p.variation_index)
      )
      AND t.status = 'failed';
    
    new_status := 'failed';
    fix_type := 'failed_task';
    
    RAISE LOG '%: Fixed stuck photoshoot % using failed task', log_prefix, photoshoot_id;
    fixed_count := fixed_count + 1;
    RETURN NEXT;
  END LOOP;
  
  -- Finally, timeout any very old processing photoshoots
  FOR photoshoot_id, old_status IN 
    SELECT id, status
    FROM photoshoots
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '30 minutes' -- very long timeout
  LOOP
    UPDATE photoshoots
    SET 
      status = 'failed',
      error_message = 'Automatically failed after 30 minutes in processing state',
      updated_at = NOW()
    WHERE id = photoshoot_id;
    
    new_status := 'failed';
    fix_type := 'timeout';
    
    RAISE LOG '%: Timed out very old photoshoot %', log_prefix, photoshoot_id;
    fixed_count := fixed_count + 1;
    RETURN NEXT;
  END LOOP;
  
  RAISE LOG '%: Full sync completed, fixed % photoshoots', log_prefix, fixed_count;
  RETURN;
END;
$$ LANGUAGE plpgsql;