/*
  # Add photoshoot type field to photoshoots table

  1. Updates
    - Add `type` column to the `photoshoots` table
    
  2. Purpose
    - Allow different types of photoshoots (regular photoshoots vs static ads)
    - Support UI filtering and organization by type
*/

-- Add type column to the photoshoots table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photoshoots' AND column_name = 'type'
  ) THEN
    ALTER TABLE photoshoots ADD COLUMN type text NOT NULL DEFAULT 'photoshoot';
  END IF;
END $$;

-- Add comment explaining the column
COMMENT ON COLUMN photoshoots.type IS 'Type of photoshoot (photoshoot or static_ad)';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS photoshoots_type_idx ON photoshoots(type);