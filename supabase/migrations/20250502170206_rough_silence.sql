/*
  # Add batch_index to photoshoots table
  
  1. Schema Updates
    - Add `batch_index` column to the `photoshoots` table
      - `batch_index` (integer, nullable, no default)
      
  2. Explanation
    - This migration adds a `batch_index` column to track the position of a photoshoot within a batch
    - The column is needed for batch processing of image generation tasks
    - Missing this column was causing errors when creating new photoshoots
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photoshoots' AND column_name = 'batch_index'
  ) THEN
    ALTER TABLE photoshoots ADD COLUMN batch_index integer;
  END IF;
END $$;

-- Create an index to improve query performance when filtering by batch_index
CREATE INDEX IF NOT EXISTS photoshoots_batch_index_idx ON photoshoots (batch_index);