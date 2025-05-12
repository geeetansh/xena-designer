/*
  # Add product information to stripe_orders table

  1. Updates
    - Add `product_id` column to the `stripe_orders` table
    
  2. Purpose
    - Store product information for each order
    - Enable displaying product name in billing history
*/

-- Add product_id column to stripe_orders table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stripe_orders' AND column_name = 'product_id'
  ) THEN
    ALTER TABLE stripe_orders ADD COLUMN product_id text;
    COMMENT ON COLUMN stripe_orders.product_id IS 'Stripe product ID or price ID for the order';
  END IF;
END $$;