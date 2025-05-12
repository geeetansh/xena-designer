import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { mapLayoutToOpenAISize } from '@/lib/utils';
import { log, error as logError, success, uploadLog, startOperation, endOperation, formatFileSize } from '@/lib/logger';
import { uploadFromBuffer } from './AssetsService';

export type GeneratedImage = {
  id: string;
  url: string;
  prompt: string;
  created_at: string;
  reference_images: ReferenceImage[];
  variation_group_id?: string;
  variation_index?: number;
};

export type ReferenceImage = {
  id: string;
  url: string;
};

// Updated with smaller default limit to prevent timeouts
export async function fetchGeneratedImages(limit: number = 10, page: number = 1): Promise<{
  images: GeneratedImage[],
  totalCount: number,
  hasMore: boolean
}> {
  try {
    // Calculate offset based on page and limit
    const offset = (page - 1) * limit;
    
    console.log(`Fetching images with limit=${limit}, page=${page}, offset=${offset}`);
    
    // Get total count
    const { count, error: countError } = await supabase
      .from('images')
      .select('*', { count: 'exact', head: true });
    // Removed AbortSignal.timeout(5000) that was causing timeouts
    
    if (countError) {
      console.error('Error fetching image count:', countError);
      // Continue anyway, we can still fetch the images
    }
    
    // Log the total count
    console.log(`Total images count: ${count}`);
    
    // Get images created by the current user with pagination
    // Only select essential fields to reduce data transfer
    console.log(`Executing query: SELECT id, url, prompt, created_at, user_id, variation_group_id, variation_index FROM images ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`);
    
    const { data: images, error: imagesError } = await supabase
      .from('images')
      .select('id, url, prompt, created_at, user_id, variation_group_id, variation_index')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    // Removed AbortSignal.timeout(10000) that was causing timeouts
    
    if (imagesError) {
      console.error('Error fetching images:', imagesError);
      throw imagesError;
    }
    
    console.log(`Fetched ${images?.length || 0} images from database`);
    
    // Fast return if no images
    if (!images || images.length === 0) {
      return { images: [], totalCount: count || 0, hasMore: false };
    }
    
    // Map images to the expected format - without trying to fetch reference_images
    // since that table no longer exists
    const generatedImages: GeneratedImage[] = images.map(image => {
      console.log(`Processing image: ${image.id}, url: ${image.url?.substring(0, 30)}...`);
      return {
        id: image.id,
        url: image.url,
        prompt: image.prompt,
        created_at: image.created_at,
        reference_images: [], // Empty array since reference_images table doesn't exist
        variation_group_id: image.variation_group_id,
        variation_index: image.variation_index
      };
    });
    
    // Calculate if there are more images to load
    const totalCount = count || 0;
    const hasMore = offset + limit < totalCount;
    
    return {
      images: generatedImages,
      totalCount,
      hasMore
    };
  } catch (error) {
    console.error('Error fetching images:', error);
    
    // Provide a more helpful error message for timeout errors
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('timed out')) {
        throw new Error('The database query timed out. Try viewing fewer images at once or adding more specific filters.');
      }
      throw error;
    }
    throw error;
  }
}

// Delete a generated image and its storage file
export async function deleteGeneratedImage(imageId: string): Promise<void> {
  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  // First check if the image belongs to the current user
  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('id, user_id, url')
    .eq('id', imageId)
    .single();
  
  if (imageError) {
    throw new Error(`Error finding image: ${imageError.message}`);
  }
  
  if (!image || image.user_id !== user.id) {
    throw new Error('You do not have permission to delete this image');
  }
  
  try {
    // Try to delete the actual image file from storage if it's from Supabase
    if (image.url && !image.url.startsWith('data:') && image.url.includes(import.meta.env.VITE_SUPABASE_URL)) {
      try {
        // Extract bucket and path from URL
        const urlPath = new URL(image.url).pathname;
        // Format: /storage/v1/object/public/[bucket]/[path]
        const parts = urlPath.split('/');
        const bucketIndex = parts.indexOf("public") + 1;
        
        if (bucketIndex > 0 && bucketIndex < parts.length) {
          const bucket = parts[bucketIndex];
          const path = parts.slice(bucketIndex + 1).join('/');
          
          // Delete the file from storage
          await supabase.storage
            .from(bucket)
            .remove([path]);
        }
      } catch (storageError) {
        // Log but continue - the database record is more important
        console.error('Error deleting file from storage:', storageError);
      }
    }
  } catch (storageError) {
    // Log but continue - the database record is more important
    console.error('Error deleting file from storage:', storageError);
  }
  
  // Delete the image record
  const { error: deleteError } = await supabase
    .from('images')
    .delete()
    .eq('id', imageId);
  
  if (deleteError) {
    throw new Error(`Error deleting image: ${deleteError.message}`);
  }

  // Also delete any associated asset entries
  try {
    const { error: assetDeleteError } = await supabase
      .from('assets')
      .delete()
      .eq('source', 'generated')
      .eq('original_url', image.url);
      
    if (assetDeleteError) {
      console.error('Error deleting associated asset:', assetDeleteError);
    }
  } catch (assetError) {
    // Log but don't fail the operation
    console.error('Error cleaning up asset records:', assetError);
  }
}

// Upload a reference image file using the new Assets service
export async function uploadImageFile(file: File, path?: string): Promise<string> {
  startOperation(`Uploading file: ${file.name} (${formatFileSize(file.size)})`);
  
  try {
    // Upload using the new AssetService
    const asset = await uploadFromBuffer(file, {
      source: 'reference',
      filename: file.name,
      content_type: file.type,
      size: file.size
    });
    
    endOperation(`File upload completed`);
    return asset.original_url;
  } catch (err) {
    logError(`Failed to upload file: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// Check if user has enough credits to generate an image
export async function checkUserCredits(): Promise<{ hasCredits: boolean, credits: number }> {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Check user's credits
    const { data: userProfile, error } = await supabase
      .from('user_profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      // Handle the case where the profile doesn't exist
      if (error.code === 'PGRST116') {
        // Create a new profile with default credits
        await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            credits: 10,
            credits_used: 0
          });
        
        return { hasCredits: true, credits: 10 };
      }
      
      throw new Error(`Error checking user credits: ${error.message}`);
    }
    
    // If profile doesn't exist or credits are null, create profile with default credits
    if (!userProfile) {
      await supabase
        .from('user_profiles')
        .insert({
          user_id: user.id,
          credits: 10,
          credits_used: 0
        });
      
      return { hasCredits: true, credits: 10 };
    }
    
    // Check if the user has credits available
    const credits = userProfile.credits || 0;
    return { hasCredits: credits > 0, credits };
  } catch (error) {
    console.error('Error checking user credits:', error);
    throw error;
  }
}

// Deduct credits from user's account
export async function deductUserCredit(count: number = 1): Promise<void> {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    log(`Deducting ${count} credits for user ${user.id}`);
    
    // Update the user's credits in the profile using the new function
    const { error } = await supabase.rpc('deduct_multiple_credits', {
      user_id_param: user.id,
      amount: count
    });
    
    if (error) {
      throw new Error(`Error deducting credits: ${error.message}`);
    }
    
    success(`Deducted ${count} credits successfully`);
  } catch (error) {
    console.error('Error deducting user credit:', error);
    throw error;
  }
}

// Get user's current credits
export async function getUserCredits(): Promise<{ credits: number, creditsUsed: number }> {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Get user profile with credits
    const { data, error } = await supabase
      .from('user_profiles')
      .select('credits, credits_used')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      // If the profile doesn't exist, create it
      if (error.code === 'PGRST116') {
        const { data: newProfile, error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            credits: 10,
            credits_used: 0
          })
          .select('credits, credits_used')
          .single();
          
        if (insertError) {
          console.error('Error creating user profile:', insertError);
          return { credits: 10, creditsUsed: 0 };
        }
        
        return { 
          credits: newProfile?.credits || 10, 
          creditsUsed: newProfile?.credits_used || 0 
        };
      }
      
      console.error('Error fetching user credits:', error);
      return { credits: 0, creditsUsed: 0 };
    }
    
    return { 
      credits: data?.credits || 0, 
      creditsUsed: data?.credits_used || 0 
    };
  } catch (error) {
    console.error('Error getting user credits:', error);
    return { credits: 0, creditsUsed: 0 };
  }
}

// Function to ensure storage bucket exists
export async function ensureStorageBucket(bucketName: string = 'images'): Promise<void> {
  try {
    // Check if the bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw new Error(`Error checking storage buckets: ${listError.message}`);
    }
    
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      // Create the bucket if it doesn't exist
      const { error } = await supabase.storage.createBucket(bucketName, {
        public: true
      });
      
      if (error) {
        throw new Error(`Error creating storage bucket: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error ensuring storage bucket exists:', error);
    throw error;
  }
}

// Function for generating images - now handles multiple variations in a single API call
export async function generateImage(
  referenceFiles: File[], 
  prompt: string,
  referenceImageUrls: string[] = [],
  variants: number = 1,
  size: string = 'auto'
): Promise<{ urls: string[], variationGroupId: string }> {
  startOperation(`Generating ${variants} images (${size}) with prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);
  const startTime = Date.now();
  
  // First check if user has credits
  const { hasCredits, credits } = await checkUserCredits();
  
  if (!hasCredits) {
    throw new Error('You have no credits remaining. Please upgrade your plan to continue generating images.');
  }
  
  if (credits < variants) {
    throw new Error(`You need ${variants} credits for this generation but only have ${credits} available.`);
  }
  
  // Ensure the storage bucket exists
  await ensureStorageBucket('images');
  
  // Upload all reference files to get their URLs if files are provided
  let allReferenceImageUrls = [...referenceImageUrls];
  
  if (referenceFiles.length > 0) {
    try {
      startOperation(`Uploading ${referenceFiles.length} images: ${referenceFiles.map(f => f.name).join(', ')}`);
      const uploadStart = Date.now();
      
      const uploadPromises = referenceFiles.map(file => uploadImageFile(file));
      const uploadedUrls = await Promise.all(uploadPromises);
      allReferenceImageUrls = [...allReferenceImageUrls, ...uploadedUrls];
      
      endOperation(`References uploaded`, uploadStart);
    } catch (uploadError) {
      logError(`Failed to upload reference files: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
      throw new Error(`Failed to upload reference images: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
    }
  }
  
  // Get the current session for authorization
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('User not authenticated');
  }
  
  try {
    // Map UI size to OpenAI size format
    const mappedSize = mapLayoutToOpenAISize(size);
    
    // Call the edge function to generate the images
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    startOperation(`Calling generate-image function with ${variants} variants at size ${mappedSize}`);
    
    // Generate a unique variation group ID that will be used to group related images
    const variationGroupId = uuidv4();
    
    // Create generation_task records for each variant BEFORE calling the API
    // This ensures we have records in the database even if the edge function fails
    const taskInserts = [];
    for (let i = 0; i < variants; i++) {
      taskInserts.push({
        user_id: session.user.id,
        prompt: prompt,
        status: "pending",
        batch_id: variationGroupId,
        total_in_batch: variants,
        batch_index: i
      });
    }
    
    // Insert all tasks
    log(`Creating ${variants} generation tasks in database`);
    const { error: taskInsertError } = await supabase
      .from('generation_tasks')
      .insert(taskInserts);
      
    if (taskInsertError) {
      logError(`Failed to create generation tasks: ${taskInsertError.message}`);
      throw new Error(`Failed to create generation tasks: ${taskInsertError.message}`);
    }
    
    log(`Successfully created generation tasks with batch ID: ${variationGroupId}`);
    
    // Now call the edge function to generate the images
    // Implement a timeout for the fetch operation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logError(`Fetch request timed out after 240 seconds`);
    }, 240000);
    
    try {
      // Create a compact payload summary for logging
      const payloadSummary = {
        reference_images_count: allReferenceImageUrls.length,
        prompt: prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt,
        variants,
        size: mappedSize
      };
      
      log(`Request payload summary: ${JSON.stringify(payloadSummary)}`);
      
      console.log(`Calling OpenAI API via edge function (generate-image) with ${variants} variants`);
      console.log('Payload:', {
        referenceUrls: allReferenceImageUrls.map(url => url.substring(0, 30) + '...'),
        prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
        variants,
        size: mappedSize
      });
      
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'X-Client-Info': 'supabase-js/2.x'
        },
        body: JSON.stringify({
          reference_images: allReferenceImageUrls,
          prompt,
          variants: variants,
          size: mappedSize
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Try to get detailed error information
        let errorDetails = '';
        try {
          const errorData = await response.json();
          errorDetails = errorData.error || errorData.message || '';
        } catch (e) {
          // If JSON parsing fails, use the status text
          errorDetails = `HTTP ${response.status}: ${response.statusText}`;
        }
        
        logError(`Edge function error response: ${errorDetails}`);
        
        // Update all task records to 'failed' status
        for (let i = 0; i < variants; i++) {
          await supabase
            .from("generation_tasks")
            .update({
              status: 'failed',
              error_message: `API Error: ${errorDetails}`,
              updated_at: new Date().toISOString()
            })
            .eq('batch_id', variationGroupId)
            .eq('batch_index', i);
            
          // Direct update of photoshoots
          try {
            await supabase
              .from('photoshoots')
              .update({
                status: 'failed',
                error_message: `API Error: ${errorDetails}`,
                updated_at: new Date().toISOString()
              })
              .eq('batch_id', variationGroupId)
              .eq('batch_index', i);
              
            log(`Directly updated photoshoot for failed request: batch=${variationGroupId}, index=${i}`);
          } catch (photoshootError) {
            logError(`Error updating photoshoot for failure: ${photoshootError}`);
          }
        }
        
        throw new Error(`Supabase edge function error: ${errorDetails}`);
      }
      
      const data = await response.json();
      console.log(`Received response from edge function:`, data);
      log(`Response received from edge function with ${data.urls?.length || 0} image URLs`);
      
      // Check if the response contains an error or fallback
      if (data.fallback) {
        logError(`Using fallback image due to OpenAI API error: ${data.error}`);
        
        // Update all task records to 'failed' status
        for (let i = 0; i < variants; i++) {
          await supabase
            .from('generation_tasks')
            .update({
              status: 'failed',
              error_message: `OpenAI API Error: ${data.error || 'Unknown error'}`,
              updated_at: new Date().toISOString()
            })
            .eq('batch_id', variationGroupId)
            .eq('batch_index', i);
          
          // Direct update of photoshoots
          try {
            await supabase
              .from('photoshoots')
              .update({
                status: 'failed',
                error_message: `OpenAI API Error: ${data.error || 'Unknown error'}`,
                updated_at: new Date().toISOString()
              })
              .eq('batch_id', variationGroupId)
              .eq('batch_index', i);
              
            log(`Directly updated photoshoot for failed API: batch=${variationGroupId}, index=${i}`);
          } catch (photoshootError) {
            logError(`Error updating photoshoot for API failure: ${photoshootError}`);
          }
        }
        
        // Still return the data, but include the error information
        return {
          urls: [data.urls[0]],
          variationGroupId,
        };
      }
      
      // Update all task records to 'completed' status
      for (let i = 0; i < variants && i < data.urls.length; i++) {
        await supabase
          .from('generation_tasks')
          .update({
            status: 'completed',
            result_image_url: data.urls[i],
            updated_at: new Date().toISOString()
          })
          .eq('batch_id', variationGroupId)
          .eq('batch_index', i);
          
        // SIMPLIFIED APPROACH: Directly update the photoshoot record
        // This makes the update immediate without relying on triggers
        try {
          await supabase
            .from('photoshoots')
            .update({
              status: 'completed',
              result_image_url: data.urls[i],
              updated_at: new Date().toISOString()
            })
            .eq('batch_id', variationGroupId)
            .eq('batch_index', i);
            
          log(`Directly updated photoshoot for batch=${variationGroupId}, index=${i}`);
        } catch (photoshootError) {
          logError(`Error updating photoshoot: ${photoshootError}`);
          // Continue processing other images even if this one fails
        }
      }
      
      // For each generated image, create an entry in the images table
      console.log(`Creating ${data.urls.length} image entries in images table`);
      for (let i = 0; i < data.urls.length; i++) {
        try {
          console.log(`Saving image ${i+1}/${data.urls.length} to images table: url=${data.urls[i].substring(0, 30)}...`);
          
          await saveGeneratedImage(
            data.urls[i],
            prompt,
            referenceImageUrls,
            {
              variation_group_id: variationGroupId,
              variation_index: i
            }
          );
          
          console.log(`Successfully saved image ${i+1}/${data.urls.length} to images table`);
        } catch (saveError) {
          console.error(`Error saving image ${i+1} to images table:`, saveError);
          // Continue with other images even if one fails
        }
      }
      
      endOperation(`Image generation completed`, startTime);
      return {
        urls: data.urls,
        variationGroupId
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        logError(`Request timeout error: The server took too long to respond`);
        
        // Update all task records to 'failed' status
        for (let i = 0; i < variants; i++) {
          await supabase
            .from('generation_tasks')
            .update({
              status: 'failed',
              error_message: 'Request timed out after 240 seconds',
              updated_at: new Date().toISOString()
            })
            .eq('batch_id', variationGroupId)
            .eq('batch_index', i);
            
          // Direct update of photoshoots
          try {
            await supabase
              .from('photoshoots')
              .update({
                status: 'failed',
                error_message: 'Request timed out after 240 seconds',
                updated_at: new Date().toISOString()
              })
              .eq('batch_id', variationGroupId)
              .eq('batch_index', i);
              
            log(`Directly updated photoshoot for failed request: batch=${variationGroupId}, index=${i}`);
          } catch (photoshootError) {
            logError(`Error updating photoshoot for failure: ${photoshootError}`);
          }
        }
        
        throw new Error('Request timed out. The Supabase Function took too long to respond (over 240 seconds). This may indicate high server load or complex image generation.');
      }
      
      // Enhanced error handling to provide more context
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError(`Error in fetch operation: ${errorMsg}`);
      
      // Update all task records to 'failed' status
      for (let i = 0; i < variants; i++) {
        await supabase
          .from('generation_tasks')
          .update({
            status: 'failed',
            error_message: errorMsg,
            updated_at: new Date().toISOString()
          })
          .eq('batch_id', variationGroupId)
          .eq('batch_index', i);
          
        // Direct update of photoshoots
        try {
          await supabase
            .from('photoshoots')
            .update({
              status: 'failed',
              error_message: errorMsg,
              updated_at: new Date().toISOString()
            })
            .eq('batch_id', variationGroupId)
            .eq('batch_index', i);
            
          log(`Directly updated photoshoot for error: batch=${variationGroupId}, index=${i}`);
        } catch (photoshootError) {
          logError(`Error updating photoshoot for error: ${photoshootError}`);
        }
      }
      
      // Identify the source of the error
      if (errorMsg.includes('NetworkError') || errorMsg.includes('network')) {
        throw new Error(`Network error connecting to Supabase: ${errorMsg}`);
      } else if (errorMsg.includes('Supabase')) {
        throw new Error(`Supabase error: ${errorMsg}`);
      } else if (errorMsg.includes('OpenAI')) {
        throw new Error(`OpenAI API error: ${errorMsg}`);
      } else {
        throw new Error(`Error generating image: ${errorMsg}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    logError(`Error in image generation process: ${error instanceof Error ? error.message : String(error)}`);
    
    // Ensure all task records are updated to 'failed' status
    try {
      for (let i = 0; i < variants; i++) {
        await supabase
          .from('generation_tasks')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : String(error),
            updated_at: new Date().toISOString()
          })
          .eq('batch_id', variationGroupId)
          .eq('batch_index', i);
          
        // Direct update of photoshoots
        try {
          await supabase
            .from('photoshoots')
            .update({
              status: 'failed',
              error_message: error instanceof Error ? error.message : String(error),
              updated_at: new Date().toISOString()
            })
            .eq('batch_id', variationGroupId)
            .eq('batch_index', i);
        } catch (photoshootError) {
          logError(`Error updating photoshoot in error handler: ${photoshootError}`);
        }
      }
    } catch (updateError) {
      logError(`Failed to update task statuses to failed: ${updateError}`);
      // Continue with the original error
    }
    
    // Provide more detailed error information
    if (error instanceof Error) {
      // Try to categorize the error source
      if (error.message.includes('storage')) {
        throw new Error(`Storage error: ${error.message}`);
      } else if (error.message.includes('credit')) {
        throw new Error(`Credit error: ${error.message}`);
      } else if (error.message.includes('timeout')) {
        throw new Error(`Timeout error: ${error.message}`);
      } else if (error.message.includes('OpenAI')) {
        throw new Error(`OpenAI error: ${error.message}`);
      } else if (error.message.includes('Supabase')) {
        throw new Error(`Supabase error: ${error.message}`);
      } else {
        throw error;
      }
    } else {
      throw new Error('An unknown error occurred during image generation');
    }
  }
}

// Save a single generated image to the database
export async function saveGeneratedImage(
  imageUrl: string,
  prompt: string,
  referenceImageUrls: string[] = [],
  metadata?: any
): Promise<string> {
  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  // If the image URL is a data URL, upload it first
  let finalImageUrl = imageUrl;
  if (imageUrl.startsWith('data:')) {
    try {
      // Convert the data URL to a Blob
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      
      // Upload the image using the new Asset service
      const asset = await uploadFromBuffer(blob, {
        source: 'generated',
        filename: `generated-${Date.now()}.png`,
        content_type: 'image/png',
        variation_group_id: metadata?.variation_group_id,
        variation_index: metadata?.variation_index
      });
      
      finalImageUrl = asset.original_url;
    } catch (uploadError) {
      logError(`Error uploading data URL: ${uploadError}`);
      // Continue with the data URL if upload fails
    }
  }
  
  console.log(`Inserting image into images table: 
  - URL: ${finalImageUrl.substring(0, 30)}...
  - Prompt: ${prompt.substring(0, 30)}...
  - User ID: ${user.id}
  - Variation Group ID: ${metadata?.variation_group_id}
  - Variation Index: ${metadata?.variation_index}
  `);
  
  // Create a new record in the images table
  try {
    const { data: imageData, error: imageError } = await supabase
      .from('images')
      .insert({
        url: finalImageUrl,
        prompt,
        user_id: user.id,
        variation_group_id: metadata?.variation_group_id,
        variation_index: metadata?.variation_index
      })
      .select('id')
      .single();
    
    if (imageError) {
      console.error('Error inserting record into images table:', imageError);
      throw new Error(`Error saving image: ${imageError.message}`);
    }
    
    console.log(`Successfully inserted image record with ID: ${imageData.id}`);
    success(`Image saved to database with ID: ${imageData.id}`);
    
    // Direct update to photoshoots table
    try {
      if (metadata?.variation_group_id && metadata?.variation_index !== undefined) {
        // Check if there's a corresponding photoshoot
        const { data: photoshoots } = await supabase
          .from('photoshoots')
          .select('id, status')
          .eq('variation_group_id', metadata.variation_group_id)
          .eq('variation_index', metadata.variation_index)
          .eq('status', 'processing');
          
        if (photoshoots && photoshoots.length > 0) {
          // Update the photoshoot
          await supabase
            .from('photoshoots')
            .update({
              status: 'completed',
              result_image_url: finalImageUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', photoshoots[0].id);
            
          log(`Directly updated photoshoot ${photoshoots[0].id} from saveGeneratedImage`);
        } else {
          // Try with batch_id instead
          const { data: batchPhotoshoots } = await supabase
            .from('photoshoots')
            .select('id, status')
            .eq('batch_id', metadata.variation_group_id)
            .eq('batch_index', metadata.variation_index)
            .eq('status', 'processing');
            
          if (batchPhotoshoots && batchPhotoshoots.length > 0) {
            await supabase
              .from('photoshoots')
              .update({
                status: 'completed',
                result_image_url: finalImageUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', batchPhotoshoots[0].id);
              
            log(`Directly updated photoshoot ${batchPhotoshoots[0].id} using batch_id from saveGeneratedImage`);
          } else {
            log(`No matching processing photoshoot found for variation_group_id=${metadata.variation_group_id}, index=${metadata.variation_index}`);
          }
        }
      }
    } catch (photoshootError) {
      logError(`Error updating photoshoot in saveGeneratedImage: ${photoshootError}`);
      // Continue without failing the save operation
    }
    
    // Also create a generation_task record to ensure proper synchronization
    try {
      const { error: taskError } = await supabase
        .from('generation_tasks')
        .insert({
          user_id: user.id,
          prompt,
          status: 'completed',
          reference_image_urls: referenceImageUrls,
          result_image_url: finalImageUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          batch_id: metadata?.variation_group_id,
          batch_index: metadata?.variation_index || 0,
          total_in_batch: 1
        });
        
      if (taskError) {
        logError(`Warning: Failed to create task record: ${taskError.message}`);
        // We don't throw here as the image was still saved successfully
      }
    } catch (taskError) {
      logError(`Warning: Exception creating task record: ${taskError}`);
      // Continue without failing the save operation
    }
    
    return imageData.id;
  } catch (error) {
    console.error('Error in saveGeneratedImage:', error);
    throw error;
  }
}