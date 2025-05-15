/*
  # Automated Ad Generation Schema

  1. New Tables
    - `automation_sessions` - Tracks a complete automated ad generation session
    - `prompt_generation_responses` - Stores raw responses from ChatGPT prompt generation
    - `prompt_variations` - Stores individual prompts extracted from ChatGPT responses
    - `generation_jobs` - Tracks individual image generation jobs

  2. Purpose
    - Support a completely separate image generation flow
    - Enable multi-step automated ad generation
    - Provide infrastructure for realtime job monitoring
*/

-- Create the automation_sessions table
CREATE TABLE IF NOT EXISTS automation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_image_url TEXT NOT NULL,
  brand_logo_url TEXT,
  reference_ad_url TEXT,
  instructions TEXT,
  variation_count INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, prompts_generated, completed, failed
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create the prompt_generation_responses table
CREATE TABLE IF NOT EXISTS prompt_generation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES automation_sessions(id) ON DELETE CASCADE,
  raw_response JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create the prompt_variations table
CREATE TABLE IF NOT EXISTS prompt_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES automation_sessions(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',  -- ready, in_progress, completed, failed
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create the generation_jobs table
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id UUID NOT NULL REFERENCES prompt_variations(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued, in_progress, completed, failed
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE automation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_generation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for automation_sessions
CREATE POLICY "Users can insert their own automation sessions"
  ON automation_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own automation sessions"
  ON automation_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own automation sessions"
  ON automation_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own automation sessions"
  ON automation_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create RLS Policies for prompt_generation_responses
CREATE POLICY "Users can select their own prompt generation responses"
  ON prompt_generation_responses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM automation_sessions
    WHERE automation_sessions.id = prompt_generation_responses.session_id
    AND automation_sessions.user_id = auth.uid()
  ));

-- Create RLS Policies for prompt_variations
CREATE POLICY "Users can select their own prompt variations"
  ON prompt_variations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM automation_sessions
    WHERE automation_sessions.id = prompt_variations.session_id
    AND automation_sessions.user_id = auth.uid()
  ));

-- Create RLS Policies for generation_jobs
CREATE POLICY "Users can select their own generation jobs"
  ON generation_jobs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM prompt_variations v
    JOIN automation_sessions s ON v.session_id = s.id
    WHERE generation_jobs.variation_id = v.id
    AND s.user_id = auth.uid()
  ));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS automation_sessions_user_id_idx ON automation_sessions(user_id);
CREATE INDEX IF NOT EXISTS prompt_variations_session_id_idx ON prompt_variations(session_id);
CREATE INDEX IF NOT EXISTS generation_jobs_variation_id_idx ON generation_jobs(variation_id);