/*
  # Add user verification status to user_profiles table

  1. Updates
    - Add `verified` column to the `user_profiles` table
    
  2. New Functions
    - `handle_new_user_verification` - Trigger function to set verified status when user verifies email
    - `sync_user_email_verification_status` - Function to sync verification status based on auth.users metadata

  3. New Triggers
    - `on_auth_user_updated` - Trigger on auth.users table when a user's email verification status changes
    
  4. Purpose
    - Track whether a user has verified their email
    - Allow UI to display appropriate messaging for unverified users
    - Support different feature access based on verification status
*/

-- Add verified column to user_profiles table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'verified'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN verified boolean DEFAULT false;
  END IF;
END $$;

-- Create function to sync user email verification status from auth.users
CREATE OR REPLACE FUNCTION sync_user_email_verification_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if email_confirmed_at has been updated to non-null
  IF NEW.email_confirmed_at IS NOT NULL AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at != NEW.email_confirmed_at) THEN
    -- Update the verified status in user_profiles
    UPDATE user_profiles
    SET 
      verified = true,
      updated_at = now()
    WHERE user_id = NEW.id
    AND (verified IS NULL OR verified = false);
    
    RAISE LOG 'User % email verification status updated to verified', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
AFTER UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION sync_user_email_verification_status();

-- Function to handle new user verification
CREATE OR REPLACE FUNCTION handle_new_user_verification()
RETURNS TRIGGER AS $$
DECLARE
  is_verified BOOLEAN;
BEGIN
  -- Check if the user's email is verified in auth.users
  SELECT (email_confirmed_at IS NOT NULL) INTO is_verified
  FROM auth.users
  WHERE id = NEW.user_id;
  
  -- Set verified status based on email confirmation
  NEW.verified := is_verified;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new user_profiles insertions
DROP TRIGGER IF EXISTS handle_new_user_verification ON user_profiles;
CREATE TRIGGER handle_new_user_verification
BEFORE INSERT ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION handle_new_user_verification();

-- Update existing user_profiles based on current verification status
UPDATE user_profiles up
SET 
  verified = (u.email_confirmed_at IS NOT NULL),
  updated_at = now()
FROM auth.users u
WHERE up.user_id = u.id
AND (up.verified IS NULL OR up.verified = false)
AND u.email_confirmed_at IS NOT NULL;