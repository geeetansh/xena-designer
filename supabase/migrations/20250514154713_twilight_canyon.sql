-- Add image_quality column to init_user_profile function to ensure it's set when new users are created

-- Update the init_user_profile function to include image_quality
CREATE OR REPLACE FUNCTION public.init_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, credits, credits_used, image_quality)
  VALUES (NEW.id, 10, 0, 'low')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Log to migrations output
DO $$
BEGIN
  RAISE NOTICE 'Updated init_user_profile function to set default image_quality to low';
END $$;