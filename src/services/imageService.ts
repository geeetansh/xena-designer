import { supabase } from '@/lib/supabase';
import { PostgrestError } from '@supabase/supabase-js';

// Interface for reference images
export interface ReferenceImage {
  id: string;
  url: string;
}

// Interface for generated images
export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  created_at: string;
  user_id: string;
  raw_json?: string;
  reference_images: ReferenceImage[]; // Change to array of reference images
}

/**
 * Fetch generated images with pagination and optimized query
 */
export async function fetchGeneratedImages(limit = 10, page = 1): Promise<{
  images: GeneratedImage[];
  totalCount: number;
  hasMore: boolean;
}> {
  try {
    // Calculate offset based on page number and limit
    const offset = (page - 1) * limit;
    
    // First, get only essential data with pagination
    // Improved query - only select necessary fields and limit the data returned
    const { data: imageData, error, count } = await supabase
      .from('images')
      .select('id, url, prompt, created_at, user_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
      .timeout(10000); // Add 10-second timeout to prevent long-running queries
    
    if (error) {
      throw error;
    }

    // Early return if no images found
    if (!imageData || imageData.length === 0) {
      return { images: [], totalCount: 0, hasMore: false };
    }
    
    // Fetch reference images for all fetched images in a single batch query
    // This reduces the number of database requests
    const imageIds = imageData.map(img => img.id);
    const { data: refData, error: refError } = await supabase
      .from('reference_images')
      .select('image_id, id, url')
      .in('image_id', imageIds)
      .timeout(5000);
    
    if (refError) {
      console.warn('Error fetching reference images:', refError);
      // Continue with the main images even if reference images fail
    }
    
    // Map reference images to their respective images
    const refMap: Record<string, ReferenceImage[]> = {};
    if (refData) {
      refData.forEach(ref => {
        if (!refMap[ref.image_id]) {
          refMap[ref.image_id] = [];
        }
        refMap[ref.image_id].push({
          id: ref.id,
          url: ref.url
        });
      });
    }
    
    // Transform the data into the expected format
    const images: GeneratedImage[] = imageData.map(img => ({
      id: img.id,
      url: img.url,
      prompt: img.prompt,
      created_at: img.created_at,
      user_id: img.user_id,
      reference_images: refMap[img.id] || []
    }));
    
    return {
      images,
      totalCount: count || 0,
      hasMore: (offset + limit) < (count || 0)
    };
    
  } catch (error) {
    console.error('Error in fetchGeneratedImages:', error);
    if (error instanceof Error) {
      if (error.message.includes('timeout') || 
         (error as PostgrestError).message?.includes('timeout')) {
        throw new Error('The database query timed out. Please try again with fewer images.');
      }
      throw error;
    }
    throw new Error('An unexpected error occurred while fetching images');
  }
}

/**
 * Delete a generated image by ID
 */
export async function deleteGeneratedImage(id: string): Promise<void> {
  const { error } = await supabase
    .from('images')
    .delete()
    .eq('id', id);
  
  if (error) {
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

/**
 * Fetch details for a single image
 */
export async function fetchImageDetails(id: string): Promise<GeneratedImage> {
  try {
    // Fetch the image data
    const { data: imageData, error } = await supabase
      .from('images')
      .select('id, url, prompt, created_at, user_id, raw_json')
      .eq('id', id)
      .single();
    
    if (error) {
      throw error;
    }
    
    if (!imageData) {
      throw new Error('Image not found');
    }
    
    // Fetch reference images
    const { data: refData, error: refError } = await supabase
      .from('reference_images')
      .select('id, url')
      .eq('image_id', id);
    
    if (refError) {
      console.warn('Error fetching reference images:', refError);
      // Continue even if reference images fail
    }
    
    // Transform into expected format
    return {
      id: imageData.id,
      url: imageData.url,
      prompt: imageData.prompt,
      created_at: imageData.created_at,
      user_id: imageData.user_id,
      raw_json: imageData.raw_json,
      reference_images: refData || []
    };
    
  } catch (error) {
    console.error('Error in fetchImageDetails:', error);
    throw error;
  }
}

/**
 * Get the user's current credits from their profile
 */
export async function getUserCredits(): Promise<{
  credits: number;
  creditsUsed: number;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User not authenticated');
    }
    
    const { data, error } = await supabase
      .from('user_profiles')
      .select('credits, credits_used')
      .eq('user_id', session.user.id)
      .single();
    
    if (error) {
      throw error;
    }
    
    return {
      credits: data?.credits || 0,
      creditsUsed: data?.credits_used || 0
    };
  } catch (error) {
    console.error('Error fetching user credits:', error);
    return {
      credits: 0,
      creditsUsed: 0
    };
  }
}

/**
 * Check if a user has enough credits for an operation
 */
export async function checkUserCredits(): Promise<{
  hasCredits: boolean;
  credits: number;
}> {
  try {
    const { credits } = await getUserCredits();
    return {
      hasCredits: credits > 0,
      credits
    };
  } catch (error) {
    console.error('Error checking user credits:', error);
    return {
      hasCredits: false,
      credits: 0
    };
  }
}

/**
 * Deduct a credit from the user's profile
 */
export async function deductUserCredit(count = 1): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User not authenticated');
    }
    
    // First get current credit count
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('credits, credits_used')
      .eq('user_id', session.user.id)
      .single();
    
    if (fetchError) {
      throw fetchError;
    }
    
    if (!profile || profile.credits < count) {
      return false; // Not enough credits
    }
    
    // Update credits
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        credits: profile.credits - count,
        credits_used: (profile.credits_used || 0) + count
      })
      .eq('user_id', session.user.id);
    
    if (updateError) {
      throw updateError;
    }
    
    return true;
  } catch (error) {
    console.error('Error deducting user credit:', error);
    return false;
  }
}

/**
 * Ensure the storage bucket exists for images
 */
export async function ensureStorageBucket(): Promise<void> {
  // This is a placeholder - in real implementation,
  // this might check if the bucket exists and create it if needed
  return Promise.resolve();
}

/**
 * Upload an image file to storage
 */
export async function uploadImageFile(file: File): Promise<string> {
  try {
    // Generate a unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
    const filePath = `uploads/${fileName}`;
    
    // Upload the file
    const { error } = await supabase.storage
      .from('images')
      .upload(filePath, file);
    
    if (error) {
      throw error;
    }
    
    // Get public URL
    const { data } = supabase.storage
      .from('images')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error('Failed to upload image file');
  }
}

/**
 * Generate an image using the AI service
 */
export async function generateImage(
  files: File[],
  prompt: string,
  referenceUrls: string[] = [],
  variants: number = 1,
  layout: string = 'auto'
): Promise<{
  urls: string[];
  variationGroupId: string;
  rawJson: any;
}> {
  try {
    // In a real implementation, this would call an API endpoint
    // For now we'll simulate with a delay and mock response
    
    // Deduct credits first
    const deducted = await deductUserCredit(variants);
    if (!deducted) {
      throw new Error('Insufficient credits for this operation');
    }
    
    // Call the API (this would be replaced with actual API call)
    // For now, simulate a delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate mock response
    const variationGroupId = `vg-${Math.random().toString(36).substring(2, 9)}`;
    const urls = Array(variants).fill(0).map((_, i) => 
      `https://picsum.photos/seed/${Math.random()}/${layout === 'landscape' ? '800/600' : 
        layout === 'portrait' ? '600/800' : '700/700'}`
    );
    
    return {
      urls,
      variationGroupId,
      rawJson: {
        prompt,
        layout,
        variant_count: variants
      }
    };
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

/**
 * Save a generated image to the database
 */
export async function saveGeneratedImage(
  url: string,
  prompt: string,
  referenceUrls: string[] = [],
  rawJson: any = {}
): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User not authenticated');
    }
    
    // Insert the image
    const { data: imageData, error: imageError } = await supabase
      .from('images')
      .insert({
        url,
        prompt,
        user_id: session.user.id,
        raw_json: typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson),
        variation_group_id: rawJson.variation_group_id,
        variation_index: rawJson.variation_index
      })
      .select('id')
      .single();
    
    if (imageError) {
      throw imageError;
    }
    
    // If there are reference URLs, save them
    if (referenceUrls.length > 0 && imageData?.id) {
      const refEntries = referenceUrls.map(refUrl => ({
        image_id: imageData.id,
        url: refUrl
      }));
      
      const { error: refError } = await supabase
        .from('reference_images')
        .insert(refEntries);
      
      if (refError) {
        console.warn('Error saving reference images:', refError);
        // Continue even if reference images fail to save
      }
    }
    
    return imageData?.id || '';
  } catch (error) {
    console.error('Error saving generated image:', error);
    throw error;
  }
}