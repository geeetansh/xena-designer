/*
  # Add batch_index to photoshoots table

  1. Updates
    - Ensure `batch_index` column exists on photoshoots table
    - Create index for better query performance
    
  2. Purpose
    - Enable tracking of multiple photoshoots in a batch
    - Support proper ordering and processing of batch photoshoots
    - Ensure efficient queries when filtering or updating by batch_index
*/

-- Add the batch_index column if it doesn't exist
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