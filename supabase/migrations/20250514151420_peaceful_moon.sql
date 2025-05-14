/*
  # Remove redundant photoshoot synchronization triggers and functions

  1. Removals
    - Remove the `task_update_sync_trigger` trigger from the `generation_tasks` table
    - Remove the `sync_task_with_image` function
    
  2. Purpose
    - Eliminate redundant database triggers since the edge function already updates the photoshoots table directly
    - Reduce overhead and simplify the database schema
    - Prevent potential conflicts between direct updates and trigger-based updates
*/

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS task_update_sync_trigger ON generation_tasks;

-- Drop the function that was called by the trigger
DROP FUNCTION IF EXISTS sync_task_with_image();

-- Log to migrations output
DO $$
BEGIN
  RAISE NOTICE 'Removed redundant trigger task_update_sync_trigger and function sync_task_with_image';
END $$;