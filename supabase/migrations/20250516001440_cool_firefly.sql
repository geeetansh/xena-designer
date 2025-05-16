/*
  # Add layout field to automation_sessions table

  1. Updates
    - Add `layout` column to the `automation_sessions` table
    
  2. Purpose
    - Allow storage of layout preferences (square, portrait, landscape, auto)
    - Support generation of images in different aspect ratios
    - Maintain consistency with the layout selection UI
*/

-- Add layout column to automation_sessions table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'automation_sessions' AND column_name = 'layout'
  ) THEN
    ALTER TABLE automation_sessions ADD COLUMN layout text DEFAULT 'auto';
    COMMENT ON COLUMN automation_sessions.layout IS 'Layout format for generated images (square, landscape, portrait, auto)';
  END IF;
END $$;