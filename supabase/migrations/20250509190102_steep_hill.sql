-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS add_credits(UUID, INT);
DROP FUNCTION IF EXISTS add_subscription_credits(UUID, INT);

-- Create function to add one-time purchase credits to a user account
CREATE OR REPLACE FUNCTION add_credits(user_id_param UUID, amount_param INT)
RETURNS VOID AS $$
BEGIN
  -- Ensure amount is positive
  IF amount_param <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  -- Create user profile if it doesn't exist
  INSERT INTO user_profiles (user_id, credits, credits_used)
  VALUES (user_id_param, amount_param, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    -- Add the credits to the existing balance
    credits = user_profiles.credits + amount_param,
    updated_at = now();
    
  -- Log the credit addition
  RAISE LOG 'Added % credits to user %', amount_param, user_id_param;
END;
$$ LANGUAGE plpgsql;

-- Create function to add subscription credits to a user account
-- This ensures the user has at least the subscription amount of credits
CREATE OR REPLACE FUNCTION add_subscription_credits(user_id_param UUID, amount_param INT)
RETURNS VOID AS $$
DECLARE
  current_credits INT;
BEGIN
  -- Ensure amount is positive
  IF amount_param <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  -- Get current credits
  SELECT credits INTO current_credits
  FROM user_profiles
  WHERE user_id = user_id_param;
  
  -- Create user profile if it doesn't exist
  INSERT INTO user_profiles (user_id, credits, credits_used)
  VALUES (user_id_param, amount_param, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    -- Set the credits to the subscription amount or keep current if higher
    -- This prevents a user from losing credits when subscription renews
    credits = GREATEST(user_profiles.credits, amount_param),
    updated_at = now();
    
  -- Log the subscription credit update
  RAISE LOG 'Updated subscription credits for user % to at least %', user_id_param, amount_param;
END;
$$ LANGUAGE plpgsql;

-- Grant execute privileges on the functions to service_role
GRANT EXECUTE ON FUNCTION add_credits(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION add_subscription_credits(UUID, INT) TO service_role;