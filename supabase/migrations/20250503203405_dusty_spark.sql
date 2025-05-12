/*
  # Create auth user trigger for automatic profile creation

  1. Create Trigger
    - Add a trigger that automatically creates a record in the user_profiles table when a new user is added to auth.users
  
  2. Security 
    - This ensures all users get a profile entry with default credits and other fields set
  
  3. Description
    - This migration fixes a critical issue where new user sign-ups were failing due to missing user_profiles records
*/

-- Create a trigger on auth.users to initialize a user profile when a new user is created
CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.init_user_profile();

-- Make sure the trigger function exists (it was listed in the schema, but let's ensure it works correctly)
CREATE OR REPLACE FUNCTION public.init_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, credits, credits_used, verified)
  VALUES (NEW.id, 10, 0, false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;