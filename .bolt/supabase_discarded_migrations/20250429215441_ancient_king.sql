/*
  # Add Shopify Products and Automations Tables
  
  1. New Tables
     - `shopify_products` - Stores Shopify product information
     - `shopify_product_images` - Stores product images linked to products
     - `automations` - Stores social media automation events
  
  2. Security
     - Enables RLS on all tables
     - Adds policies for authenticated users
     
  3. Indexes and Constraints
     - Foreign key relationships between tables
     - Indexes for performance
*/

-- Create users table if it doesn't exist (required for foreign keys)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policy for users table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' 
    AND policyname = 'Users can read own data'
  ) THEN
    CREATE POLICY "Users can read own data"
      ON public.users
      FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;
END $$;

-- Create Shopify products table
CREATE TABLE IF NOT EXISTS public.shopify_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_id text NOT NULL,
  title text NOT NULL,
  handle text,
  price_amount numeric,
  price_currency text,
  user_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create Shopify product images table
CREATE TABLE IF NOT EXISTS public.shopify_product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.shopify_products(id) ON DELETE CASCADE,
  shopify_id text,
  url text NOT NULL,
  alt_text text,
  position integer,
  created_at timestamptz DEFAULT now()
);

-- Create automations table
CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  name text NOT NULL,
  significance text,
  instructions jsonb,
  products jsonb,
  reference_images jsonb,
  total_generations integer DEFAULT 0,
  status text DEFAULT 'scheduled',
  completed_generations integer DEFAULT 0,
  user_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS shopify_products_user_id_idx ON public.shopify_products(user_id);
CREATE INDEX IF NOT EXISTS shopify_product_images_product_id_idx ON public.shopify_product_images(product_id);
CREATE INDEX IF NOT EXISTS automations_user_id_idx ON public.automations(user_id);
CREATE INDEX IF NOT EXISTS automations_date_idx ON public.automations(date);

-- Enable RLS
ALTER TABLE public.shopify_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

-- Create policies for shopify_products
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_products' 
    AND policyname = 'Users can read their own Shopify products'
  ) THEN
    CREATE POLICY "Users can read their own Shopify products"
      ON public.shopify_products
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_products' 
    AND policyname = 'Users can insert their own Shopify products'
  ) THEN
    CREATE POLICY "Users can insert their own Shopify products"
      ON public.shopify_products
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_products' 
    AND policyname = 'Users can update their own Shopify products'
  ) THEN
    CREATE POLICY "Users can update their own Shopify products"
      ON public.shopify_products
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_products' 
    AND policyname = 'Users can delete their own Shopify products'
  ) THEN
    CREATE POLICY "Users can delete their own Shopify products"
      ON public.shopify_products
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Create policies for shopify_product_images
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_product_images' 
    AND policyname = 'Users can read their own Shopify product images'
  ) THEN
    CREATE POLICY "Users can read their own Shopify product images"
      ON public.shopify_product_images
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM shopify_products
        WHERE shopify_products.id = product_id AND shopify_products.user_id = auth.uid()
      ));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_product_images' 
    AND policyname = 'Users can insert their own Shopify product images'
  ) THEN
    CREATE POLICY "Users can insert their own Shopify product images"
      ON public.shopify_product_images
      FOR INSERT
      TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM shopify_products
        WHERE shopify_products.id = product_id AND shopify_products.user_id = auth.uid()
      ));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_product_images' 
    AND policyname = 'Users can update their own Shopify product images'
  ) THEN
    CREATE POLICY "Users can update their own Shopify product images"
      ON public.shopify_product_images
      FOR UPDATE
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM shopify_products
        WHERE shopify_products.id = product_id AND shopify_products.user_id = auth.uid()
      ));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shopify_product_images' 
    AND policyname = 'Users can delete their own Shopify product images'
  ) THEN
    CREATE POLICY "Users can delete their own Shopify product images"
      ON public.shopify_product_images
      FOR DELETE
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM shopify_products
        WHERE shopify_products.id = product_id AND shopify_products.user_id = auth.uid()
      ));
  END IF;
END $$;

-- Create policies for automations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'automations' 
    AND policyname = 'Users can read their own automations'
  ) THEN
    CREATE POLICY "Users can read their own automations"
      ON public.automations
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'automations' 
    AND policyname = 'Users can insert their own automations'
  ) THEN
    CREATE POLICY "Users can insert their own automations"
      ON public.automations
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'automations' 
    AND policyname = 'Users can update their own automations'
  ) THEN
    CREATE POLICY "Users can update their own automations"
      ON public.automations
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'automations' 
    AND policyname = 'Users can delete their own automations'
  ) THEN
    CREATE POLICY "Users can delete their own automations"
      ON public.automations
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add triggers for updated_at timestamps if they don't exist
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

  -- Add trigger for shopify_products
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_shopify_products_timestamp'
    AND tgrelid = 'public.shopify_products'::regclass
  ) THEN
    CREATE TRIGGER update_shopify_products_timestamp
    BEFORE UPDATE ON public.shopify_products
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
  
  -- Add trigger for automations
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_automations_timestamp'
    AND tgrelid = 'public.automations'::regclass
  ) THEN
    CREATE TRIGGER update_automations_timestamp
    BEFORE UPDATE ON public.automations
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
END $$;