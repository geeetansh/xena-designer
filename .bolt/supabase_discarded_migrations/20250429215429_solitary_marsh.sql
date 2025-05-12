/*
  # Fix Shopify Credentials Table
  
  1. Creates the shopify_credentials table if it doesn't exist
  2. Enables RLS on the table
  3. Creates policies for secure access control if they don't already exist
  4. Sets up automatic timestamp updates
*/

-- Create Shopify credentials table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.shopify_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  store_url text NOT NULL,
  storefront_access_token text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT shopify_credentials_user_id_key UNIQUE (user_id)
);

-- Enable Row Level Security
ALTER TABLE public.shopify_credentials ENABLE ROW LEVEL SECURITY;

-- Create policies for shopify_credentials only if they don't exist
DO $$ 
BEGIN
  -- Check if the SELECT policy exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_credentials' 
    AND policyname = 'Users can read their own Shopify credentials'
  ) THEN
    CREATE POLICY "Users can read their own Shopify credentials"
      ON public.shopify_credentials
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  -- Check if the INSERT policy exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_credentials' 
    AND policyname = 'Users can insert their own Shopify credentials'
  ) THEN
    CREATE POLICY "Users can insert their own Shopify credentials"
      ON public.shopify_credentials
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Check if the UPDATE policy exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_credentials' 
    AND policyname = 'Users can update their own Shopify credentials'
  ) THEN
    CREATE POLICY "Users can update their own Shopify credentials"
      ON public.shopify_credentials
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  -- Check if the DELETE policy exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_credentials' 
    AND policyname = 'Users can delete their own Shopify credentials'
  ) THEN
    CREATE POLICY "Users can delete their own Shopify credentials"
      ON public.shopify_credentials
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add trigger for updated_at timestamp
DO $$ 
BEGIN
  -- First ensure the update_timestamp function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'update_timestamp'
  ) THEN
    CREATE OR REPLACE FUNCTION update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;

  -- Then check if the trigger exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_shopify_credentials_timestamp'
    AND tgrelid = 'public.shopify_credentials'::regclass
  ) THEN
    CREATE TRIGGER update_shopify_credentials_timestamp
    BEFORE UPDATE ON public.shopify_credentials
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
END $$;