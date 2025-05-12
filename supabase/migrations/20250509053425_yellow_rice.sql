/*
  # Add image variant URLs to assets table

  1. Updates
    - Add `grid_view_url` column to the `assets` table
    - Add `thumbnail_url` column to the `assets` table
    
  2. Purpose
    - Store URLs for different image size variants
    - Support efficient loading of appropriately sized images in different UI contexts
    - Reduce bandwidth usage and improve performance
*/

-- Add grid_view_url column to assets table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'grid_view_url'
  ) THEN
    ALTER TABLE assets ADD COLUMN grid_view_url text;
    COMMENT ON COLUMN assets.grid_view_url IS 'URL for grid view variant (200px width with proportional height)';
  END IF;
END $$;

-- Add thumbnail_url column to assets table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'thumbnail_url'
  ) THEN
    ALTER TABLE assets ADD COLUMN thumbnail_url text;
    COMMENT ON COLUMN assets.thumbnail_url IS 'URL for thumbnail variant (100x100px)';
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS assets_grid_view_url_idx ON assets(grid_view_url);
CREATE INDEX IF NOT EXISTS assets_thumbnail_url_idx ON assets(thumbnail_url);