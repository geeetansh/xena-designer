/*
  # Fix add_credits function parameter names

  1. Updates
    - Add overloaded version of add_credits function with parameter order (amount, user_id_param)
    - Add overloaded version of add_subscription_credits function with parameter order (amount, user_id_param)
    
  2. Purpose
    - Fix parameter order issue in the webhook function
    - Maintain backward compatibility with existing code
    - Ensure credits are properly added to user accounts on purchase
*/

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS add_credits(amount INT, user_id_param UUID);
DROP FUNCTION IF EXISTS add_subscription_credits(amount INT, user_id_param UUID);

-- Create overloaded version of add_credits function with parameters in the order the webhook expects
CREATE OR REPLACE FUNCTION add_credits(amount INT, user_id_param UUID)
RETURNS VOID AS $$
BEGIN
  -- Ensure amount is positive
  IF amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  -- Create user profile if it doesn't exist
  INSERT INTO user_profiles (user_id, credits, credits_used)
  VALUES (user_id_param, amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    -- Add the credits to the existing balance
    credits = user_profiles.credits + amount,
    updated_at = now();
    
  -- Log the credit addition
  RAISE LOG 'Added % credits to user % (overloaded function)', amount, user_id_param;
END;
$$ LANGUAGE plpgsql;

-- Create overloaded version of add_subscription_credits function
CREATE OR REPLACE FUNCTION add_subscription_credits(amount INT, user_id_param UUID)
RETURNS VOID AS $$
DECLARE
  current_credits INT;
BEGIN
  -- Ensure amount is positive
  IF amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  -- Get current credits
  SELECT credits INTO current_credits
  FROM user_profiles
  WHERE user_id = user_id_param;
  
  -- Create user profile if it doesn't exist
  INSERT INTO user_profiles (user_id, credits, credits_used)
  VALUES (user_id_param, amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    -- Set the credits to the subscription amount or keep current if higher
    -- This prevents a user from losing credits when subscription renews
    credits = GREATEST(user_profiles.credits, amount),
    updated_at = now();
    
  -- Log the subscription credit update
  RAISE LOG 'Updated subscription credits for user % to at least % (overloaded function)', user_id_param, amount;
END;
$$ LANGUAGE plpgsql;

-- Grant execute privileges on the functions to service_role
GRANT EXECUTE ON FUNCTION add_credits(INT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION add_subscription_credits(INT, UUID) TO service_role;

-- Also keep the original functions with the (user_id_param, amount_param) order
-- for backward compatibility with any existing code

-- Create function to add one-time purchase credits to a user account
CREATE OR REPLACE FUNCTION add_credits(user_id_param UUID, amount_param INT)
RETURNS VOID AS $$
BEGIN
  -- Call the new overloaded function
  PERFORM add_credits(amount_param, user_id_param);
END;
$$ LANGUAGE plpgsql;

-- Create function to add subscription credits to a user account
CREATE OR REPLACE FUNCTION add_subscription_credits(user_id_param UUID, amount_param INT)
RETURNS VOID AS $$
BEGIN
  -- Call the new overloaded function
  PERFORM add_subscription_credits(amount_param, user_id_param);
END;
$$ LANGUAGE plpgsql;

-- Grant execute privileges on these functions too
GRANT EXECUTE ON FUNCTION add_credits(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION add_subscription_credits(UUID, INT) TO service_role;