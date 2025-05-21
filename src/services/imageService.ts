import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { mapLayoutToOpenAISize } from '@/lib/utils';
import { log, error as logError, success, uploadLog, startOperation, endOperation, formatFileSize } from '@/lib/logger';
import { trackEvent } from '@/lib/posthog';
import { getImageQuality } from '@/services/settingsService';

// Upload a reference image file
export async function uploadImageFile(file: File, path?: string): Promise<string> {
  startOperation(`Uploading file: ${file.name} (${formatFileSize(file.size)})`);
  
  try {
    // Ensure the bucket exists
    await ensureStorageBucket('user-uploads');
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const userId = user.id;
    
    // Generate a unique file path
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
    const filePath = path || `${userId}/${fileName}`;
    
    // Upload file to Supabase Storage
    const { data, error } = await supabase.storage
      .from('user-uploads')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
    
    // Get a public URL
    const { data: urlData } = supabase.storage
      .from('user-uploads')
      .getPublicUrl(filePath);
    
    endOperation(`File upload completed`);
    return urlData.publicUrl;
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
            credits_used: 0,
            image_quality: 'low'
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
          credits_used: 0,
          image_quality: 'low'
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
    
    // Track credit usage
    trackEvent('credits_used', { 
      count, 
      action: 'generate_image'
    });
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
            credits_used: 0,
            image_quality: 'low'
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
export async function ensureStorageBucket(bucketName: string = 'user-uploads'): Promise<void> {
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
  size: string = 'auto',
  quality: string = 'low'
): Promise<{ urls: string[], variationGroupId: string, rawJson?: any }> {
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
  await ensureStorageBucket('user-uploads');
  
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
  
  // Track the image generation attempt
  trackEvent('generate_image_started', {
    prompt: prompt.substring(0, 100),
    reference_count: allReferenceImageUrls.length,
    variants,
    size,
    quality
  });
  
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
    log(`Created variation group ID: ${variationGroupId} for ${variants} variants`);
    
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
        size: mappedSize,
        quality
      };
      
      log(`Request payload summary: ${JSON.stringify(payloadSummary)}`);
      
      console.log(`Calling OpenAI API via edge function (generate-image) with ${variants} variants`);
      console.log('Payload:', {
        referenceUrls: allReferenceImageUrls.map(url => url.substring(0, 30) + '...'),
        prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
        variants,
        size: mappedSize,
        quality
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
          size: mappedSize,
          quality
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
        
        // Track error event
        trackEvent('image_generation_error', {
          error: errorDetails,
          status: response.status,
          prompt_length: prompt.length
        });
        
        throw new Error(`Supabase edge function error: ${errorDetails}`);
      }
      
      const data = await response.json();
      console.log(`Received response from edge function:`, data);
      log(`Response received from edge function with ${data.urls?.length || 0} image URLs`);
      
      // Check if the response contains an error or fallback
      if (data.fallback) {
        logError(`Using fallback image due to OpenAI API error: ${data.error}`);
        
        // Track the fallback event
        trackEvent('image_generation_fallback', {
          error: data.error,
          prompt_length: prompt.length
        });
        
        // Still return the data, but include the error information
        return {
          urls: [data.urls[0]],
          variationGroupId,
          rawJson: data
        };
      }
      
      // Track successful generation
      trackEvent('image_generation_completed', {
        image_count: data.urls.length,
        prompt_length: prompt.length,
        generation_time_ms: Date.now() - startTime
      });
      
      endOperation(`Image generation completed`, startTime);
      return {
        urls: data.urls,
        variationGroupId,
        rawJson: data
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        logError(`Request timeout error: The server took too long to respond`);
        
        // Track timeout error
        trackEvent('image_generation_timeout', {
          prompt_length: prompt.length
        });
        
        throw new Error('Request timed out. The Supabase Function took too long to respond (over 240 seconds). This may indicate high server load or complex image generation.');
      }
      
      // Enhanced error handling to provide more context
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError(`Error in fetch operation: ${errorMsg}`);
      
      // Track error by type
      trackEvent('image_generation_error', {
        error_type: error.name || 'Unknown',
        error_message: errorMsg.substring(0, 100)
      });
      
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
        throw new Error(`OpenAI API error: ${error.message}`);
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