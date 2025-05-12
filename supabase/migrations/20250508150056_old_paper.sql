/*
  # Clean up synchronization code

  1. Removes
    - All database triggers for synchronization
    - All repair functions
    - All diagnostic views
    
  2. Purpose
    - Simplify database schema by removing complex trigger-based synchronization
    - Remove obsolete repair functions now that direct updates are implemented in application code
    - Eliminate potential sources of confusion or conflict in the database
*/

-- Drop all triggers first
DROP TRIGGER IF EXISTS update_photoshoot_on_task_update ON generation_tasks;
DROP TRIGGER IF EXISTS update_photoshoot_from_image ON images;
DROP TRIGGER IF EXISTS sync_photoshoot_to_images ON photoshoots;

-- Drop all functions related to synchronization
DROP FUNCTION IF EXISTS sync_photoshoot_from_task();
DROP FUNCTION IF EXISTS update_photoshoot_from_image();
DROP FUNCTION IF EXISTS save_photoshoot_to_images();
DROP FUNCTION IF EXISTS repair_single_photoshoot(UUID);
DROP FUNCTION IF EXISTS rescue_stuck_photoshoots();
DROP FUNCTION IF EXISTS detect_status_mismatches();
DROP FUNCTION IF EXISTS fix_orphaned_photoshoots();
DROP FUNCTION IF EXISTS full_sync_photoshoots_with_images();
DROP FUNCTION IF EXISTS fix_generation_batch_status(UUID);
DROP FUNCTION IF EXISTS diagnose_photoshoot(UUID);
DROP FUNCTION IF EXISTS backfill_missing_variation_data();
DROP FUNCTION IF EXISTS sync_missing_variation_data();
DROP FUNCTION IF EXISTS check_photoshoot_image_sync();
DROP FUNCTION IF EXISTS get_image_variations(UUID);

-- Drop views related to synchronization
DROP VIEW IF EXISTS stuck_photoshoots;
DROP VIEW IF EXISTS photoshoot_sync_status;

-- Keep only the useful function for batch status information
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

-- The database is now simplified, with all synchronization handled directly by the application code