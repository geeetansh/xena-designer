/*
  # Add prompt template settings

  1. New Tables
    - `prompt_templates`
      - `id` (uuid, primary key)
      - `base_prompt_text` (text)
      - `custom_properties` (jsonb)
      - `user_id` (uuid, nullable, foreign key to users.id)
      - `last_modified_timestamp` (timestamp with time zone)
      - `created_at` (timestamp with time zone)
  2. Security
    - Enable RLS on `prompt_templates` table
    - Add policies for authenticated users to read/write their own prompt templates
*/

-- Create prompt_templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_prompt_text text NOT NULL,
  custom_properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id),
  last_modified_timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read their own prompt templates"
  ON prompt_templates
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own prompt templates"
  ON prompt_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own prompt templates"
  ON prompt_templates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own prompt templates"
  ON prompt_templates
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);