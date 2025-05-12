-- Add variation_group_id column to photoshoots table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photoshoots' AND column_name = 'variation_group_id'
  ) THEN
    ALTER TABLE photoshoots ADD COLUMN variation_group_id uuid;
    COMMENT ON COLUMN photoshoots.variation_group_id IS 'Groups related photoshoot variations generated in the same request';
  END IF;
END $$;

-- Add variation_index column to photoshoots table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photoshoots' AND column_name = 'variation_index'
  ) THEN
    ALTER TABLE photoshoots ADD COLUMN variation_index integer;
    COMMENT ON COLUMN photoshoots.variation_index IS 'Index of this variation within its group (0-based)';
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS photoshoots_variation_group_id_idx ON photoshoots(variation_group_id);
CREATE INDEX IF NOT EXISTS photoshoots_variation_group_id_index_idx ON photoshoots(variation_group_id, variation_index);

-- Fix any existing photoshoots to match batch_id and batch_index
UPDATE photoshoots
SET 
  variation_group_id = batch_id,
  variation_index = batch_index
WHERE 
  batch_id IS NOT NULL 
  AND variation_group_id IS NULL;