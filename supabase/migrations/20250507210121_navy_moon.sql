/*
  # Fix batch generation status function return type

  1. Updates
    - Modify the `get_batch_generation_status` function to cast bigint values to integer
    
  2. Purpose
    - Fix type mismatch error in the frontend
    - Ensure compatibility with existing code expecting integer values
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_batch_generation_status;

-- Recreate with explicit integer casts
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
      COUNT(*)::integer AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::integer AS completed,
      COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed,
      COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending,
      COUNT(*) FILTER (WHERE status = 'processing')::integer AS processing
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

-- Fix any stuck photoshoots again (run one last time)
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