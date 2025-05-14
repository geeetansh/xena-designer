import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { uploadImageFile, generateImage } from './imageService';
import { mapLayoutToOpenAISize } from '@/lib/utils';
import { log, success, error as logError, startOperation, endOperation } from '@/lib/logger';
import { getImageQuality } from '@/services/settingsService';

export type PhotoshootStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type PhotoshootType = 'photoshoot' | 'static_ad';

export interface Photoshoot {
  id: string;
  name: string;
  prompt: string;
  product_image_url: string;
  reference_image_url?: string | null;
  result_image_url?: string | null;
  status: PhotoshootStatus;
  type: PhotoshootType;
  error_message?: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  batch_id?: string | null;
  batch_index?: number | null;
  variation_group_id?: string | null;
  variation_index?: number | null;
}

/**
 * Creates a new photoshoot with multiple variations
 */
export async function createPhotoshoot(
  name: string,
  prompt: string,
  productImageFile: File | null,
  productImageUrl: string | null,
  referenceImageFile: File | null = null,
  referenceImageUrl: string | null = null,
  layout: string = 'auto',
  variants: number = 1,
  type: PhotoshootType = 'photoshoot'
): Promise<Photoshoot> {
  try {
    startOperation(`Creating photoshoot: ${name}`);
    log(`Prompt: "${prompt}", Layout: ${layout}, Variants: ${variants}, Type: ${type}`);
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Get the user's image quality setting
    const imageQuality = await getImageQuality();
    log(`User's image quality setting: ${imageQuality}`);
    
    // Handle product image - either use URL or upload file
    let finalProductImageUrl: string;
    
    if (productImageUrl) {
      finalProductImageUrl = productImageUrl;
      log(`Using provided product image URL`);
    } else if (productImageFile) {
      log(`Uploading product image: ${productImageFile.name}`);
      finalProductImageUrl = await uploadImageFile(productImageFile);
      log(`Product image uploaded successfully`);
    } else {
      throw new Error('Either product image URL or file is required');
    }
    
    // Handle reference image - either use URL or upload file (both optional)
    let finalReferenceImageUrl: string | null = null;
    
    if (referenceImageUrl) {
      finalReferenceImageUrl = referenceImageUrl;
      log(`Using provided reference image URL`);
    } else if (referenceImageFile) {
      log(`Uploading reference image: ${referenceImageFile.name}`);
      finalReferenceImageUrl = await uploadImageFile(referenceImageFile);
      log(`Reference image uploaded successfully`);
    }
    
    // Generate group ID for tracking related photoshoots
    const variationGroupId = uuidv4();
    log(`Created variation group ID: ${variationGroupId} for ${variants} variants`);
    
    // Create photoshoot entries for all variations at once
    const photoshootEntries = [];
    
    for (let i = 0; i < variants; i++) {
      // Create variation name for each
      const variationName = variants > 1 ? `${name} (Variation ${i+1})` : name;
      
      photoshootEntries.push({
        name: variationName,
        prompt,
        product_image_url: finalProductImageUrl,
        reference_image_url: finalReferenceImageUrl,
        user_id: user.id,
        status: 'pending',
        type,
        batch_id: variationGroupId,
        batch_index: i,
        variation_group_id: variationGroupId,
        variation_index: i
      });
    }
    
    // Insert all photoshoot entries
    const { data, error: insertError } = await supabase
      .from('photoshoots')
      .insert(photoshootEntries)
      .select('*');
    
    if (insertError) {
      logError('Database insert error:', insertError);
      throw new Error(`Failed to create photoshoot entries: ${insertError.message}`);
    }
    
    log(`Successfully created ${photoshootEntries.length} photoshoot entries`);
    
    // Prepare reference image URLs
    const referenceUrls: string[] = [];
    if (finalProductImageUrl) {
      referenceUrls.push(finalProductImageUrl);
    }
    if (finalReferenceImageUrl) {
      referenceUrls.push(finalReferenceImageUrl);
    }
    
    // Start image generation asynchronously (don't await to avoid blocking the UI)
    try {
      // Use the generateImage function that supports multiple variants
      log(`Starting image generation with ${variants} variants`);
      
      const referenceImages: File[] = [];
      if (productImageFile) referenceImages.push(productImageFile);
      if (referenceImageFile) referenceImages.push(referenceImageFile);
      
      // CHANGE: Wrap in a try/catch and explicitly handle errors
      generateImage(
        referenceImages, 
        prompt, 
        referenceUrls, 
        variants, 
        layout,
        imageQuality
      ).then(async (result) => {
        log(`Generated ${result.urls.length} images successfully with variation group ID: ${result.variationGroupId}`);
        
        // Update each photoshoot with its corresponding image
        for (let i = 0; i < result.urls.length && i < variants; i++) {
          try {
            const photoshootId = data && data[i] ? data[i].id : null;
            if (!photoshootId) continue;
            
            // Update the photoshoot status and result image URL
            const { error: updateError } = await supabase
              .from('photoshoots')
              .update({
                status: 'completed',
                result_image_url: result.urls[i],
                updated_at: new Date().toISOString(),
                variation_group_id: result.variationGroupId,
                variation_index: i
              })
              .eq('id', photoshootId);
              
            if (updateError) {
              logError(`Error updating photoshoot ${photoshootId}: ${updateError.message}`);
            } else {
              success(`Updated photoshoot ${photoshootId} with image URL: ${result.urls[i].substring(0, 30)}...`);
            }
          } catch (updateError) {
            logError(`Error updating photoshoot with result: ${updateError}`);
          }
        }
      }).catch((err) => {
        logError(`Error in image generation: ${err.message}`);
        
        if (data && data.length > 0) {
          for (const photoshoot of data) {
            supabase
              .from('photoshoots')
              .update({
                status: 'failed',
                error_message: err.message || 'Unknown error during image generation',
                updated_at: new Date().toISOString()
              })
              .eq('id', photoshoot.id)
              .then(() => {
                log(`Updated photoshoot ${photoshoot.id} to failed status`);
              })
              .catch((updateError) => {
                logError(`Error updating photoshoot status: ${updateError}`);
              });
          }
        }
      });
      
    } catch (generationError) {
      logError(`Error starting image generation: ${generationError}`);
      throw generationError;
    }
    
    // Return the first photoshoot entry
    return data ? data[0] : null;
  } catch (err) {
    logError('Error creating photoshoot:', err);
    throw err;
  }
}

/**
 * Fetches all photoshoots for the current user
 */
export async function fetchPhotoshoots(
  limit: number = 50,
  page: number = 1
): Promise<{
  photoshoots: Photoshoot[];
  hasMore: boolean;
  totalCount: number;
}> {
  try {
    // Calculate offset based on page and limit
    const offset = (page - 1) * limit;
    
    // Get total count
    const { count, error: countError } = await supabase
      .from('photoshoots')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      throw countError;
    }
    
    // Get photoshoots
    const { data, error } = await supabase
      .from('photoshoots')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) {
      throw error;
    }
    
    return {
      photoshoots: data,
      hasMore: (count || 0) > offset + data.length,
      totalCount: count || 0
    };
  } catch (err) {
    logError('Error fetching photoshoots:', err);
    throw err;
  }
}

/**
 * Deletes a photoshoot
 */
export async function deletePhotoshoot(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('photoshoots')
      .delete()
      .eq('id', id);
    
    if (error) {
      throw error;
    }
  } catch (err) {
    logError('Error deleting photoshoot:', err);
    throw err;
  }
}