/*
  # Add variation fields to assets table

  1. Schema Updates
    - Add `variation_group_id` column to the `assets` table
    - Add `variation_index` column to the `assets` table
    
  2. Purpose
    - Support grouping related image variations together in the assets table
    - Enable proper ordering of variations by their index
    - Maintain consistency with the new schema for the images table
*/

-- Add variation_group_id column to assets table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'variation_group_id'
  ) THEN
    ALTER TABLE assets ADD COLUMN variation_group_id uuid;
    COMMENT ON COLUMN assets.variation_group_id IS 'Groups related image variations generated in the same request';
  END IF;
END $$;

-- Add variation_index column to assets table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'variation_index'
  ) THEN
    ALTER TABLE assets ADD COLUMN variation_index integer;
    COMMENT ON COLUMN assets.variation_index IS 'Index of this variation within its group (0-based)';
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS assets_variation_group_id_idx ON assets(variation_group_id);
CREATE INDEX IF NOT EXISTS assets_variation_group_id_index_idx ON assets(variation_group_id, variation_index);