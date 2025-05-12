/*
  # Set up storage buckets and policies for image management
  
  1. Creates storage buckets:
    - library - For user library images
    - images - For generated images
    - user-uploads - For user uploaded content
    - shopify-images - For Shopify product images
    - assets - For consolidated storage in the future
    
  2. Sets policies for each bucket to:
    - Allow users to read their own files
    - Allow users to upload their own files
    - Allow users to update their own files
    - Allow users to delete their own files
*/

-- Create library images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('library', 'library', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create images bucket for generated images if it doesn't exist  
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create user-uploads bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-uploads', 'user-uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create shopify-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('shopify-images', 'shopify-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create assets bucket for migrating toward consolidated storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Library bucket policies
CREATE POLICY "Library bucket: Allow users to select their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Library bucket: Allow users to insert their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Library bucket: Allow users to update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Library bucket: Allow users to delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Images bucket policies
CREATE POLICY "Images bucket: Allow users to select their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Images bucket: Allow users to insert their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Images bucket: Allow users to update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Images bucket: Allow users to delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- User-uploads bucket policies
CREATE POLICY "User-uploads bucket: Allow users to select their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "User-uploads bucket: Allow users to insert their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "User-uploads bucket: Allow users to update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "User-uploads bucket: Allow users to delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Shopify-images bucket policies
CREATE POLICY "Shopify-images bucket: Allow users to select their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'shopify-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Shopify-images bucket: Allow users to insert their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shopify-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Shopify-images bucket: Allow users to update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'shopify-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Shopify-images bucket: Allow users to delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'shopify-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Assets bucket policies
CREATE POLICY "Assets bucket: Allow users to select their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Assets bucket: Allow users to insert their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Assets bucket: Allow users to update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Assets bucket: Allow users to delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);