/*
  # Modify user verification system to use OTP

  1. Updates:
    - Remove `verified` column from `user_profiles` table which is no longer needed with OTP
    - Remove the `handle_new_user_verification` and `sync_user_email_verification_status` functions
    - Remove the related triggers
    
  2. Purpose:
    - Simplify the user verification system
    - Remove unused functionality related to the old email verification link system
*/

-- Remove the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

-- Drop the verification sync function
DROP FUNCTION IF EXISTS sync_user_email_verification_status();

-- Drop the new user verification trigger
DROP TRIGGER IF EXISTS handle_new_user_verification ON user_profiles;

-- Drop the function
DROP FUNCTION IF EXISTS handle_new_user_verification();

-- Check and remove the verified column from user_profiles
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'verified'
  ) THEN
    ALTER TABLE user_profiles DROP COLUMN verified;
  END IF;
END $$;

-- Update the init_user_profile function to remove reference to verified field
CREATE OR REPLACE FUNCTION public.init_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, credits, credits_used)
  VALUES (NEW.id, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;