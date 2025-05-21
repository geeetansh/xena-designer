/*
  # Add shopify_admin_credentials table

  1. New Tables
    - `shopify_admin_credentials`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `store_url` (text)
      - `access_token` (text)
      - `shop_name` (text)
      - `scopes` (text)
      - `connected_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      
  2. Security
    - Enable RLS on `shopify_admin_credentials` table
    - Add policies for authenticated users to manage their admin credentials
    
  3. Purpose
    - Store Shopify Admin API credentials separately from existing storefront credentials
    - Support OAuth-based Admin API integration
    - Allow both integrations to exist simultaneously
*/

-- Create shopify_admin_credentials table
CREATE TABLE IF NOT EXISTS shopify_admin_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
  store_url text NOT NULL,
  access_token text NOT NULL,
  shop_name text,
  scopes text,
  connected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE shopify_admin_credentials ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can select their own admin credentials"
  ON shopify_admin_credentials
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own admin credentials"
  ON shopify_admin_credentials
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own admin credentials"
  ON shopify_admin_credentials
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own admin credentials"
  ON shopify_admin_credentials
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS shopify_admin_credentials_user_id_idx 
  ON shopify_admin_credentials(user_id);