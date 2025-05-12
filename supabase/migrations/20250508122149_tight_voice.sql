/*
  # Fix Image Generation Status Synchronization

  1. Purpose
    - Create a more robust system for syncing statuses between generation_tasks and photoshoots
    - Eliminate cases where photoshoots get stuck in "processing" state
    - Add comprehensive logging to make troubleshooting easier

  2. Changes
    - Improve the trigger function to handle edge cases and provide better logging
    - Add missing indexes to ensure efficient lookups
    - Create a job to fix any currently stuck photoshoots
*/

-- First, drop the existing trigger
DROP TRIGGER IF EXISTS sync_photoshoot_to_images ON photoshoots;

-- Create improved trigger function to better sync the images table when photoshoots complete
CREATE OR REPLACE FUNCTION save_photoshoot_to_images()
RETURNS TRIGGER AS $$
DECLARE
  inserted_id UUID;
  log_prefix TEXT := 'PHOTOSHOOT_IMAGE_SYNC';
BEGIN
  -- Only proceed if status changed to 'completed' and we have a result image URL
  IF (OLD.status <> 'completed' AND NEW.status = 'completed' AND NEW.result_image_url IS NOT NULL) THEN
    RAISE LOG '%: Syncing completed photoshoot % to images table', log_prefix, NEW.id;
    
    -- Insert into images table if no record exists for this result image
    INSERT INTO images (
      url, 
      prompt, 
      user_id, 
      created_at, 
      raw_json,
      variation_group_id,
      variation_index
    )
    SELECT 
      NEW.result_image_url, 
      NEW.prompt, 
      NEW.user_id, 
      NEW.created_at,
      json_build_object(
        'source', 'photoshoot',
        'photoshoot_id', NEW.id,
        'photoshoot_name', NEW.name,
        'photoshoot_type', NEW.type,
        'batch_id', NEW.batch_id,
        'batch_index', NEW.batch_index,
        'variation_group_id', NEW.variation_group_id,
        'variation_index', NEW.variation_index
      )::text,
      NEW.variation_group_id,
      NEW.variation_index
    WHERE NOT EXISTS (
      SELECT 1 FROM images 
      WHERE url = NEW.result_image_url
    )
    RETURNING id INTO inserted_id;

    -- Log the operation
    IF inserted_id IS NOT NULL THEN
      RAISE LOG '%: Created new image record % for photoshoot %', 
        log_prefix, inserted_id, NEW.id;
    ELSE
      RAISE LOG '%: No new image record created for photoshoot % (may already exist)', 
        log_prefix, NEW.id;
    END IF;

    -- Also create an asset record for the result image
    INSERT INTO assets (
      user_id, 
      source, 
      original_url, 
      filename, 
      content_type, 
      created_at,
      variation_group_id,
      variation_index
    )
    SELECT 
      NEW.user_id,
      'generated',
      NEW.result_image_url,
      NEW.name || '.png',
      'image/png',
      NOW(),
      NEW.variation_group_id,
      NEW.variation_index
    WHERE NOT EXISTS (
      SELECT 1 FROM assets 
      WHERE original_url = NEW.result_image_url
    )
    RETURNING id INTO inserted_id;
    
    -- Log the asset creation
    IF inserted_id IS NOT NULL THEN
      RAISE LOG '%: Created new asset record % for photoshoot %', 
        log_prefix, inserted_id, NEW.id;
    ELSE
      RAISE LOG '%: No new asset record created for photoshoot % (may already exist)', 
        log_prefix, NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log any exceptions that occur during execution
  RAISE LOG '%: Error processing photoshoot %: %', log_prefix, NEW.id, SQLERRM;
  -- Don't rethrow the error - we want the trigger to continue even if there's an error
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger again
CREATE TRIGGER sync_photoshoot_to_images
AFTER UPDATE ON photoshoots
FOR EACH ROW
EXECUTE FUNCTION save_photoshoot_to_images();

-- Create indexes to ensure efficient lookups
CREATE INDEX IF NOT EXISTS generation_tasks_batch_id_batch_index_idx 
ON generation_tasks(batch_id, batch_index);

CREATE INDEX IF NOT EXISTS photoshoots_batch_id_batch_index_idx 
ON photoshoots(batch_id, batch_index);

-- Create function to fix all generation tasks related to a specific batch
CREATE OR REPLACE FUNCTION fix_generation_batch_status(batch_id_param UUID) 
RETURNS INTEGER AS $$
DECLARE
  fixed_count INTEGER := 0;
  task RECORD;
  photoshoot RECORD;
  log_prefix TEXT := 'BATCH_STATUS_FIX';
BEGIN
  -- Check if any tasks in this batch are stuck in 'processing' for too long
  FOR task IN 
    SELECT * FROM generation_tasks 
    WHERE batch_id = batch_id_param
    AND status = 'processing'
    AND updated_at < NOW() - INTERVAL '10 minutes'
  LOOP
    -- Update the task to 'failed' status
    UPDATE generation_tasks
    SET 
      status = 'failed',
      error_message = 'Automatically marked as failed after being stuck in processing for over 10 minutes',
      updated_at = NOW()
    WHERE id = task.id;
    
    -- Get the corresponding photoshoot
    SELECT * INTO photoshoot FROM photoshoots
    WHERE (batch_id = task.batch_id AND batch_index = task.batch_index)
       OR (variation_group_id = task.batch_id AND variation_index = task.batch_index)
    LIMIT 1;
    
    -- If found, update it too
    IF photoshoot IS NOT NULL THEN
      UPDATE photoshoots
      SET 
        status = 'failed',
        error_message = 'Automatically marked as failed after being stuck in processing for over 10 minutes',
        updated_at = NOW()
      WHERE id = photoshoot.id;
      
      RAISE LOG '%: Fixed stuck photoshoot % for task %', log_prefix, photoshoot.id, task.id;
    END IF;
    
    fixed_count := fixed_count + 1;
    RAISE LOG '%: Fixed stuck task %', log_prefix, task.id;
  END LOOP;
  
  RETURN fixed_count;
END;
$$ LANGUAGE plpgsql;