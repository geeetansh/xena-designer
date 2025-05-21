/*
  # Remove unused database components

  1. Tables Removed
    - `reference_images` table (completely removed)
    - `photoshoots` table (completely removed)

  2. Columns Removed
    - `batch_id`, `total_in_batch`, and `batch_index` columns from `generation_tasks`
    - `variation_group_id` and `variation_index` columns from `images` 
    - `photoshoot_instructions` column from `user_settings`
    - `layout` column from `automation_sessions`

  3. Views Removed
    - `stripe_user_subscriptions` view
    - `stripe_user_orders` view
*/

-- Drop views first (since they may depend on tables/columns we're dropping)
DROP VIEW IF EXISTS stripe_user_subscriptions;
DROP VIEW IF EXISTS stripe_user_orders;

-- Drop tables
DROP TABLE IF EXISTS reference_images;
DROP TABLE IF EXISTS photoshoots;

-- Remove columns from generation_tasks table
ALTER TABLE generation_tasks DROP COLUMN IF EXISTS batch_id;
ALTER TABLE generation_tasks DROP COLUMN IF EXISTS total_in_batch;
ALTER TABLE generation_tasks DROP COLUMN IF EXISTS batch_index;

-- Remove columns from images table
ALTER TABLE images DROP COLUMN IF EXISTS variation_group_id;
ALTER TABLE images DROP COLUMN IF EXISTS variation_index;

-- Remove column from user_settings table
ALTER TABLE user_settings DROP COLUMN IF EXISTS photoshoot_instructions;

-- Remove column from automation_sessions table
ALTER TABLE automation_sessions DROP COLUMN IF EXISTS layout;