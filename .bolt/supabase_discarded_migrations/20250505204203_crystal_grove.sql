/*
  # Revert changes to images table - restore NOT NULL constraint

  1. Changes
    - Make `user_id` column NOT NULL again
    - Drop the existing foreign key constraint with ON DELETE SET NULL
    - Re-add the foreign key constraint without ON DELETE SET NULL
    
  2. Purpose
    - Revert the changes made in the previous migration
    - Ensure data integrity by requiring user_id for all images
*/

-- First, check if there are any NULL user_id values and handle them
-- This is important to avoid constraint violation when making the column NOT NULL
DO $$ 
BEGIN
  -- Count records with NULL user_id
  DECLARE null_count INTEGER;
  BEGIN
    SELECT COUNT(*) INTO null_count FROM images WHERE user_id IS NULL;
    
    IF null_count > 0 THEN
      RAISE NOTICE 'Found % images with NULL user_id that will be deleted', null_count;
      
      -- Delete records with NULL user_id to avoid constraint violation
      DELETE FROM images WHERE user_id IS NULL;
    END IF;
  END;

  -- Drop the existing foreign key constraint
  ALTER TABLE images 
  DROP CONSTRAINT IF EXISTS images_user_id_fkey;

  -- Make user_id NOT NULL again
  ALTER TABLE images 
  ALTER COLUMN user_id SET NOT NULL;

  -- Re-add the foreign key constraint without ON DELETE SET NULL
  ALTER TABLE images
  ADD CONSTRAINT images_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id);

  RAISE NOTICE 'Successfully restored NOT NULL constraint on images.user_id and removed ON DELETE SET NULL';
END $$;