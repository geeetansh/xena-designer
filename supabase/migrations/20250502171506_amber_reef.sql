/*
  # Add batch_index to photoshoots table

  1. Updates
    - Add `batch_index` column to the `photoshoots` table
    
  2. Purpose
    - Support batch operations for photoshoots
    - Enable ordered processing of photoshoots in a batch
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