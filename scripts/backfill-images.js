// This script is used to backfill credit usage for existing images
// It counts existing images for each user and updates their credits_used value
// Run with: npm run backfill

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function backfillImageCredits() {
  try {
    console.log('Starting credit usage backfill for existing images...');
    
    // Get all users with images
    const { data: usersWithImages, error: userError } = await supabase
      .from('images')
      .select('user_id, count')
      .group('user_id');
    
    if (userError) {
      throw new Error(`Error fetching users with images: ${userError.message}`);
    }
    
    console.log(`Found ${usersWithImages.length} users with images to process`);
    
    // Process each user
    for (const userEntry of usersWithImages) {
      const userId = userEntry.user_id;
      const imageCount = parseInt(userEntry.count);
      
      console.log(`Processing user ${userId} with ${imageCount} images`);
      
      // Update user profile with image count as credits_used
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ 
          credits_used: imageCount,
          // Make sure they still have some credits left
          credits: Math.max(10 - imageCount, 1)
        })
        .eq('user_id', userId);
      
      if (updateError) {
        console.error(`Error updating credits for user ${userId}: ${updateError.message}`);
        continue;
      }
      
      console.log(`Successfully updated credits for user ${userId}`);
    }
    
    console.log('Credit usage backfill completed successfully');
  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillImageCredits();