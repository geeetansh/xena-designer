/*
  # Add product_name column to stripe_orders table

  1. Updates
    - Add `product_name` column to the `stripe_orders` table
    
  2. Purpose
    - Store product name directly in the database when order is created
    - Avoid need for real-time product lookups from frontend
    - Make order history display more efficient
*/

-- Add product_name column to stripe_orders table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stripe_orders' AND column_name = 'product_name'
  ) THEN
    ALTER TABLE stripe_orders ADD COLUMN product_name text;
    COMMENT ON COLUMN stripe_orders.product_name IS 'Name of the Stripe product or price purchased';
  END IF;
END $$;

-- Update the stripe_user_orders view to include product_name
CREATE OR REPLACE VIEW stripe_user_orders WITH (security_invoker = true) AS
SELECT
    c.customer_id,
    o.id as order_id,
    o.checkout_session_id,
    o.payment_intent_id,
    o.amount_subtotal,
    o.amount_total,
    o.currency,
    o.payment_status,
    o.status as order_status,
    o.created_at as order_date,
    o.product_id,
    o.product_name
FROM stripe_customers c
LEFT JOIN stripe_orders o ON c.customer_id = o.customer_id
WHERE c.user_id = auth.uid()
AND c.deleted_at IS NULL
AND o.deleted_at IS NULL
ORDER BY o.created_at DESC;

-- Grant select on the updated view
GRANT SELECT ON stripe_user_orders TO authenticated;