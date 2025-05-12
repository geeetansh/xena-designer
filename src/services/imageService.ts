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