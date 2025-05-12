/*
  # Add unique constraint for batch photoshoots

  1. Updates
    - Add a unique constraint on `photoshoots` table for (batch_id, batch_index)
    
  2. Purpose
    - Ensure data integrity for batch processing
    - Prevent duplicate entries for the same batch position
    - Enable more reliable batch image generation
*/

-- Add a unique constraint on photoshoots table for batch_id and batch_index
DO $$ 
BEGIN
  -- Only create the constraint if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'photoshoots_batch_id_batch_index_key'
  ) THEN
    -- First ensure batch_index is not null where batch_id is provided
    UPDATE photoshoots 
    SET batch_index = 0
    WHERE batch_id IS NOT NULL AND batch_index IS NULL;
    
    -- Create the unique constraint
    ALTER TABLE photoshoots
    ADD CONSTRAINT photoshoots_batch_id_batch_index_key
    UNIQUE (batch_id, batch_index);
  END IF;
END $$;

-- Create a similar constraint on generation_tasks table
DO $$ 
BEGIN
  -- Only create the constraint if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'generation_tasks_batch_id_batch_index_key'
  ) THEN
    -- First ensure batch_index is not null where batch_id is provided
    UPDATE generation_tasks 
    SET batch_index = 0
    WHERE batch_id IS NOT NULL AND batch_index IS NULL;
    
    -- Create the unique constraint
    ALTER TABLE generation_tasks
    ADD CONSTRAINT generation_tasks_batch_id_batch_index_key
    UNIQUE (batch_id, batch_index);
  END IF;
END $$;

-- Create function to get detailed batch status
CREATE OR REPLACE FUNCTION get_batch_generation_status(batch_id_param UUID)
RETURNS TABLE (
  total INTEGER,
  completed INTEGER,
  failed INTEGER,
  pending INTEGER,
  processing INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH batch_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'processing') AS processing
    FROM generation_tasks
    WHERE batch_id = batch_id_param
  )
  SELECT 
    batch_stats.total,
    batch_stats.completed,
    batch_stats.failed,
    batch_stats.pending,
    batch_stats.processing
  FROM batch_stats;
END;
$$ LANGUAGE plpgsql;