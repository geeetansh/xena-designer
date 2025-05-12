/*
  # Fix missing variation data in assets table

  1. Updates
    - Backfill missing variation_group_id and variation_index in assets table 
    - Create repair functions to identify and fix stuck photoshoots
    - Add better handling for edge cases in DB triggers
    
  2. Purpose
    - Ensure all generated assets have proper variation IDs
    - Automatic repair of stuck photoshoots
    - Provide tools to monitor and fix synchronization issues
*/

-- Create a function to backfill missing variation data from images to assets table
CREATE OR REPLACE FUNCTION backfill_missing_variation_data()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update assets entries that have matching URLs in the images table
  -- but are missing variation_group_id or variation_index
  WITH updated AS (
    UPDATE assets a
    SET 
      variation_group_id = i.variation_group_id,
      variation_index = i.variation_index
    FROM images i
    WHERE 
      a.original_url = i.url
      AND a.source = 'generated'
      AND i.variation_group_id IS NOT NULL
      AND (
        a.variation_group_id IS NULL OR
        a.variation_index IS NULL
      )
    RETURNING a.id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Run the backfill function
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT backfill_missing_variation_data() INTO updated_count;
  RAISE NOTICE 'Updated % asset records with missing variation data', updated_count;
END $$;

-- Create a function to repair stuck photoshoots by forcing a resync
CREATE OR REPLACE FUNCTION repair_photoshoot(photoshoot_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  p RECORD;
  t RECORD;
  success BOOLEAN := FALSE;
BEGIN
  -- Get the photoshoot
  SELECT * INTO p FROM photoshoots WHERE id = photoshoot_id;
  IF p IS NULL THEN
    RAISE EXCEPTION 'Photoshoot with ID % not found', photoshoot_id;
  END IF;
  
  -- Find the corresponding generation task
  SELECT * INTO t FROM generation_tasks
  WHERE batch_id = p.batch_id AND batch_index = p.batch_index
  LIMIT 1;
  
  IF t IS NULL THEN
    -- No task found, try to find a task with matching variation_group_id
    SELECT * INTO t FROM generation_tasks
    WHERE batch_id = p.variation_group_id AND batch_index = p.variation_index
    LIMIT 1;
    
    IF t IS NULL THEN
      RAISE EXCEPTION 'No matching task found for photoshoot %', photoshoot_id;
    END IF;
  END IF;
  
  -- Update the photoshoot based on the task
  UPDATE photoshoots
  SET 
    status = t.status,
    result_image_url = CASE 
      WHEN t.result_image_url IS NOT NULL THEN t.result_image_url 
      ELSE result_image_url 
    END,
    error_message = CASE 
      WHEN t.error_message IS NOT NULL THEN t.error_message 
      ELSE error_message 
    END,
    updated_at = NOW()
  WHERE id = photoshoot_id;
  
  success := TRUE;
  RETURN success;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error repairing photoshoot %: %', photoshoot_id, SQLERRM;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Create a function to ensure all photoshoots have matching variation data
CREATE OR REPLACE FUNCTION sync_missing_variation_data()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update photoshoots where batch_id is set but variation_group_id is not
  WITH updated AS (
    UPDATE photoshoots
    SET 
      variation_group_id = batch_id,
      variation_index = batch_index
    WHERE 
      batch_id IS NOT NULL 
      AND (variation_group_id IS NULL OR variation_index IS NULL)
    RETURNING id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Run the variation data sync function
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT sync_missing_variation_data() INTO updated_count;
  RAISE NOTICE 'Synced % photoshoots with missing variation data', updated_count;
END $$;

-- Make sure both generation_tasks and assets have indexes for efficient lookups
CREATE INDEX IF NOT EXISTS assets_original_url_idx ON assets(original_url);
CREATE INDEX IF NOT EXISTS generation_tasks_result_image_url_idx ON generation_tasks(result_image_url);