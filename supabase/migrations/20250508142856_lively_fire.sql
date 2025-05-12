/*
  # Clean up photoshoot update triggers and functions

  1. Drops:
    - Remove all triggers related to photoshoot updates
    - Remove all stored procedures for photoshoot repair
    - Drop views created for monitoring stuck photoshoots
    
  2. Purpose:
    - Simplify the database schema
    - Move from complex trigger-based updates to direct updates
    - Remove technical debt and reduce complexity
*/

-- Drop triggers first
DROP TRIGGER IF EXISTS update_photoshoot_on_task_update ON generation_tasks;
DROP TRIGGER IF EXISTS update_photoshoot_from_image ON images;
DROP TRIGGER IF EXISTS sync_photoshoot_to_images ON photoshoots;

-- Drop functions
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

-- Drop views
DROP VIEW IF EXISTS stuck_photoshoots;
DROP VIEW IF EXISTS photoshoot_sync_status;