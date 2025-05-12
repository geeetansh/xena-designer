/*
  # Make user_id nullable with ON DELETE SET NULL

  1. Schema Updates
    - Modify the `images` table to make `user_id` column nullable
    - Drop existing foreign key constraint
    - Re-add foreign key constraint with ON DELETE SET NULL
    
  2. Purpose
    - Allow images to remain in the database when a user is deleted
    - Instead of cascading deletes, set user_id to NULL on user deletion
    - Maintain data integrity while preserving generated images
*/

-- Check if user_id is already nullable, if not make it nullable
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'images' 
    AND column_name = 'user_id' 
    AND is_nullable = 'NO'
  ) THEN
    -- Make user_id nullable
    ALTER TABLE images 
    ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

-- Drop the existing foreign key constraint
ALTER TABLE images 
DROP CONSTRAINT IF EXISTS images_user_id_fkey;

-- Re-add the foreign key constraint with ON DELETE SET NULL
ALTER TABLE images
ADD CONSTRAINT images_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users(id)
ON DELETE SET NULL;

-- Log the changes
DO $$
BEGIN
  RAISE NOTICE 'Modified images table: user_id is now nullable with ON DELETE SET NULL';
END $$;