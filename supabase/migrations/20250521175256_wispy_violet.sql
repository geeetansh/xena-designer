/*
  # Add edited images support

  1. New Tables
    - `edited_images` - Stores edited versions of generated images
      - `id` (uuid, primary key)
      - `original_image_id` (uuid, references generation_jobs)
      - `user_id` (uuid, references users)
      - `prompt` (text, the edit instructions)
      - `image_url` (text, the URL of the edited image)
      - `status` (text, editing status: 'processing', 'completed', 'failed')
      - `error_message` (text, null unless status is 'failed')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `edited_images` table
    - Add policies for authenticated users to read/write their own edited images
*/

-- Create edited_images table
CREATE TABLE IF NOT EXISTS public.edited_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_image_id uuid NOT NULL,
  user_id uuid NOT NULL,
  prompt text NOT NULL,
  image_url text,
  status text NOT NULL DEFAULT 'processing',
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT edited_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_edited_images_original_image_id ON public.edited_images USING btree (original_image_id);
CREATE INDEX IF NOT EXISTS idx_edited_images_user_id ON public.edited_images USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_edited_images_status ON public.edited_images USING btree (status);

-- Enable Row Level Security
ALTER TABLE public.edited_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can select their own edited images" 
ON public.edited_images
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own edited images" 
ON public.edited_images
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own edited images" 
ON public.edited_images
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own edited images" 
ON public.edited_images
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);