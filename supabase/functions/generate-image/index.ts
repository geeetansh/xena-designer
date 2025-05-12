import OpenAI from 'npm:openai@4.36.0';
import { createClient } from 'npm:@supabase/supabase-js@2.39.8';
import { v4 as uuidv4 } from 'npm:uuid@9.0.1';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, apikey"
};

// Initialize OpenAI with environment variables
const openai = new OpenAI({
  apiKey: Deno.env.get("VITE_OPENAI_API_KEY")
});

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to extract path from a Supabase storage URL
function extractPathFromUrl(url: string): { bucket: string, path: string } {
  try {
    // URL format: https://[project-ref].supabase.co/storage/v1/object/public/[bucket]/[path]
    const storagePrefix = '/storage/v1/object/public/';
    const storageIndex = url.indexOf(storagePrefix);
    
    if (storageIndex === -1) {
      throw new Error('Not a valid Supabase storage URL');
    }
    
    // Get everything after the public/ part
    const pathWithBucket = url.substring(storageIndex + storagePrefix.length);
    
    // The first segment is the bucket name
    const firstSlashIndex = pathWithBucket.indexOf('/');
    if (firstSlashIndex === -1) {
      throw new Error('URL does not contain a file path');
    }
    
    // Extract the bucket and the path
    const bucket = pathWithBucket.substring(0, firstSlashIndex);
    const path = pathWithBucket.substring(firstSlashIndex + 1);
    
    return { bucket, path };
  } catch (error) {
    console.error('Error extracting path from URL:', error);
    throw new Error(`Invalid Supabase storage URL: ${url}`);
  }
}

// Function to download image from Supabase or external URL
async function downloadImageFromUrl(url: string): Promise<Blob> {
  const startTime = Date.now();
  console.log(`Downloading image: ${url}`);
  
  try {
    // For non-Supabase URLs, use direct fetch
    if (!url.includes(supabaseUrl)) {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log(`Downloaded external image in ${((Date.now() - startTime) / 1000).toFixed(1)}s (${(blob.size / 1024).toFixed(1)} KB)`);
      return blob;
    }
    
    // For Supabase URLs, extract bucket and path
    const { bucket, path } = extractPathFromUrl(url);
    console.log(`Supabase image: bucket=${bucket}, path=${path}`);
    
    // Download the file using Supabase Storage API
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);
    
    if (error) {
      throw error;
    }
    
    if (!data) {
      throw new Error('No data received from Supabase');
    }
    
    // Determine content type based on file extension
    let contentType = 'image/png'; // Default
    const fileName = path.toLowerCase();
    if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (fileName.endsWith('.webp')) {
      contentType = 'image/webp';
    }
    
    console.log(`Downloaded Supabase image in ${((Date.now() - startTime) / 1000).toFixed(1)}s (${(data.size / 1024).toFixed(1)} KB)`);
    return new Blob([data], { type: contentType });
  } catch (error) {
    // Fallback to direct fetch if Supabase download fails
    console.log(`Falling back to direct fetch for URL: ${url}`);
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log(`Fallback download completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s (${(blob.size / 1024).toFixed(1)} KB)`);
      return blob;
    } catch (fetchError) {
      console.error('Error in fallback fetch:', fetchError);
      throw new Error(`Failed to download image: ${error.message || 'Unknown error'}`);
    }
  }
}

// Function to save generated image to Supabase
async function saveImageToStorage(imageBase64: string, userId: string, imageId: string): Promise<string> {
  const startTime = Date.now();
  console.log(`Saving image to storage with ID: ${imageId}`);
  
  try {
    // Convert base64 to binary data
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
    
    // Create path for the image: users/{userId}/generated/{imageId}.png
    const imagePath = `${userId}/generated/${imageId}.png`;
    
    // Ensure the 'images' bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === "images");
    
    if (!bucketExists) {
      try {
        // Create the bucket if it doesn't exist
        const { error } = await supabase.storage.createBucket("images", {
          public: true // Make the bucket public
        });
        
        if (error) {
          // Check if it's a duplicate error (bucket was created in a race condition)
          if (error.message?.includes('409') || error.message?.includes('Duplicate') || 
              (typeof error === 'object' && 'statusCode' in error && error.statusCode === '409')) {
            console.log(`Bucket 'images' already exists (created by another process)`);
          } else {
            throw new Error(`Error creating storage bucket: ${error.message}`);
          }
        } else {
          console.log(`Successfully created 'images' bucket with public access`);
        }
      } catch (createError) {
        // If creation fails, check again - another process might have created it
        const { data: checkBuckets } = await supabase.storage.listBuckets();
        if (!checkBuckets?.some(bucket => bucket.name === "images")) {
          // If still doesn't exist, propagate the error
          throw createError;
        }
        // Otherwise, bucket exists now, continue
        console.log(`Bucket 'images' already exists after rechecking`);
      }
    }
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("images")
      .upload(imagePath, binaryData.buffer, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload generated image: ${uploadError.message}`);
    }

    // Get the public URL of the uploaded image
    const { data: urlData } = supabase.storage
      .from("images")
      .getPublicUrl(imagePath);

    console.log(`Image uploaded in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return urlData.publicUrl;
  } catch (error) {
    console.error(`Error saving image to storage:`, error);
    throw error;
  }
}

// Main handler for the Edge Function
Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  const executionId = uuidv4().substring(0, 8); // Short ID for logs
  const requestStartTime = Date.now();
  console.log(`[${executionId}] Generate-image function started`);
  console.log(`[${executionId}] Request IP: ${req.headers.get('x-forwarded-for') || 'unknown'}`);
  console.log(`[${executionId}] Request Origin: ${req.headers.get('origin') || 'unknown'}`);

  try {
    // Get request data
    const requestData = await req.json();
    const { 
      prompt, 
      reference_images, 
      variants = 1,  // Default to 1 if not specified
      size = 'auto' // Default to auto if not specified
    } = requestData;
    
    console.log(`[${executionId}] Request: prompt="${prompt?.substring(0, 30) || 'undefined'}...", refs=${reference_images?.length || 0}, variants=${variants}, size=${size || 'default'}`);
    
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
    
    // Get authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
    
    // Extract token and get user ID
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
    
    // Check if user has enough credits
    console.log(`[${executionId}] Checking credits for user ${user.id}`);
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    
    if (profileError) {
      // If profile doesn't exist, create it with default credits
      if (profileError.code === 'PGRST116') {
        console.log(`[${executionId}] User profile not found, creating with default credits`);
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            credits: 10,
            credits_used: 0
          })
          .select('credits')
          .single();
          
        if (createError) {
          return new Response(
            JSON.stringify({ error: `Failed to create user profile: ${createError.message}` }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders
              }
            }
          );
        }
        
        const userCredits = newProfile?.credits || 10;
        if (userCredits < variants) {
          return new Response(
            JSON.stringify({
              error: "Insufficient credits",
              message: `You need ${variants} credits but only have ${userCredits} available.`,
              credits: userCredits
            }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders
              }
            }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: `Failed to get user profile: ${profileError.message}` }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          }
        );
      }
    } else {
      const userCredits = userProfile?.credits || 0;
      if (userCredits < variants) {
        return new Response(
          JSON.stringify({
            error: "Insufficient credits",
            message: `You need ${variants} credits but only have ${userCredits} available.`,
            credits: userCredits
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          }
        );
      }
    }
    
    // Ensure reference images array exists
    const referenceImages = reference_images || [];
    
    try {
      // Download reference images
      console.log(`[${executionId}] Downloading ${referenceImages.length} reference images`);
      const downloadStart = Date.now();
      
      const imageBlobs = [];
      for (const url of referenceImages) {
        try {
          const blob = await downloadImageFromUrl(url);
          imageBlobs.push(blob);
        } catch (downloadError) {
          console.error(`[${executionId}] Error downloading image ${url}:`, downloadError);
        }
      }
      
      console.log(`[${executionId}] Downloaded ${imageBlobs.length}/${referenceImages.length} images in ${((Date.now() - downloadStart) / 1000).toFixed(1)}s`);
      
      // Create proper file objects from blobs for OpenAI
      const imageFiles = imageBlobs.map((blob, index) => {
        return new File([blob], `reference_${index}.png`, { type: blob.type });
      });
      
      // Generate a variation group ID to link all images
      const variationGroupId = uuidv4();
      
      // Record start time for tracking API response time
      const startTime = Date.now();
      console.log(`[${executionId}] OpenAI API call starting with n=${variants}`);
      
      // Set a timeout to log if OpenAI doesn't respond within 240 seconds
      let timeoutId: number | null = setTimeout(() => {
        console.log(`[${executionId}] ⚠️ WARNING: No reply from OpenAI after 240 seconds`);
      }, 240 * 1000);

      // Prepare the OpenAI request payload
      let openaiRequest: any;
      let response;
      
      // If we have reference images, use the edit endpoint
      if (imageFiles.length > 0) {
        console.log(`[${executionId}] Using image-to-image generation with ${imageFiles.length} reference images`);
        openaiRequest = {
          model: "gpt-image-1",
          prompt: prompt,
          image: imageFiles,
          n: variants, // Generate multiple variations at once
          quality: "high",
          size: size // Pass size parameter directly
        };
        
        response = await openai.images.edit(openaiRequest);
      } 
      // Otherwise use text-to-image endpoint
      else {
        console.log(`[${executionId}] Using text-to-image generation (no references)`);
        openaiRequest = {
          model: "gpt-image-1",
          prompt: prompt,
          n: variants, // Generate multiple variations at once
          quality: "high",
          size: size // Pass size parameter directly
        };
        
        response = await openai.images.generate(openaiRequest);
      }
      
      // Clear timeout as we got a response
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Log the variation count and returned URLs
      console.log(`[${executionId}] ✅ OpenAI API response: variationGroupId=${variationGroupId}, requestedVariants=${variants}, returnedUrls=${response.data.length}`);
      
      // Check if we got fewer URLs than requested variants
      if (response.data.length < variants) {
        console.warn(`[${executionId}] ⚠️ WARNING: Received fewer variations (${response.data.length}) than requested (${variants})`);
      }
      
      // Process each generated image
      const imageUrls = [];
      
      for (let i = 0; i < response.data.length; i++) {
        const imageData = response.data[i];
        const base64Data = imageData.b64_json;
        
        if (!base64Data) {
          console.error(`[${executionId}] Missing b64_json for image ${i+1}/${response.data.length}`);
          continue;
        }
        
        // Generate a unique ID for this specific image variation
        const imageId = `${variationGroupId}_${i}`;
        
        // Save to storage
        console.log(`[${executionId}] Saving image ${i+1}/${response.data.length} to storage`);
        
        // Ensure the 'images' bucket exists
        try {
          const { data: buckets } = await supabase.storage.listBuckets();
          const bucketExists = buckets?.some(bucket => bucket.name === "images");
          
          if (!bucketExists) {
            await supabase.storage.createBucket("images", {
              public: true
            });
            console.log(`[${executionId}] Created images bucket`);
          }
        } catch (bucketError) {
          console.error(`[${executionId}] Error checking/creating bucket:`, bucketError);
          // Continue with the upload attempt
        }
        
        const storedImageUrl = await saveImageToStorage(base64Data, user.id, imageId);
        
        imageUrls.push(storedImageUrl);
        
        // Insert into images table
        try {
          console.log(`[${executionId}] Inserting image ${i+1}/${response.data.length} into images table...`);
          
          const { data: imageRecord, error: insertError } = await supabase
            .from('images')
            .insert({
              url: storedImageUrl,
              prompt: prompt,
              user_id: user.id,
              variation_group_id: variationGroupId,
              variation_index: i,
              created_at: new Date().toISOString()
            })
            .select('id')
            .single();
            
          if (insertError) {
            console.error(`[${executionId}] ERROR: Failed to insert image record: ${insertError.message}`);
          } else {
            console.log(`[${executionId}] SUCCESS: Inserted image record with ID: ${imageRecord.id}`);
          }
        } catch (insertError) {
          console.error(`[${executionId}] EXCEPTION: Failed to insert image record:`, insertError);
        }
      }
      
      // Update all task records to 'completed' status
      for (let i = 0; i < variants && i < response.data.length; i++) {
        await supabase
          .from('generation_tasks')
          .update({
            status: 'completed',
            result_image_url: imageUrls[i],
            updated_at: new Date().toISOString()
          })
          .eq('batch_id', variationGroupId)
          .eq('batch_index', i);
          
        // Direct update of photoshoots
        try {
          await supabase
            .from('photoshoots')
            .update({
              status: 'completed',
              result_image_url: imageUrls[i],
              updated_at: new Date().toISOString()
            })
            .eq('batch_id', variationGroupId)
            .eq('batch_index', i);
            
          console.log(`[${executionId}] Directly updated photoshoot for batch=${variationGroupId}, index=${i}`);
        } catch (photoshootError) {
          console.error(`[${executionId}] Error updating photoshoot: ${photoshootError}`);
          // Continue processing other images even if this one fails
        }
      }
      
      // Deduct credits based on the number of variants
      await supabase.rpc("deduct_multiple_credits", { 
        user_id_param: user.id, 
        amount: variants 
      });
      
      console.log(`[${executionId}] Deducted ${variants} credit(s) from user ${user.id}`);
      console.log(`[${executionId}] Total request time: ${((Date.now() - requestStartTime) / 1000).toFixed(1)}s`);
      
      // Return all image URLs and the variation group ID
      return new Response(
        JSON.stringify({
          urls: imageUrls,
          variation_group_id: variationGroupId,
          input: {
            prompt,
            reference_images: referenceImages,
            size
          },
          output: response
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    } catch (generationError) {
      console.error(`[${executionId}] Generation API error:`, generationError);
      
      // Log the full error details for debugging
      console.error(`[${executionId}] Full error details:`, {
        message: generationError.message,
        stack: generationError.stack,
        code: generationError.code,
        name: generationError.name,
        cause: generationError.cause
      });
      
      // Log the request payload
      console.log(`[${executionId}] Request payload:`, {
        prompt, reference_images, variants, size
      });
      
      // Generate a unique error ID for tracking
      const errorId = uuidv4();
      
      // Provide a fallback image
      const fallbackImageUrl = "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/68100a4d9b154c0a40484bd8_ChatGPT%20Image%20Apr%2029%2C%202025%2C%2004_37_51%20AM.png";
      
      console.log(`[${executionId}] Using fallback image due to error (${errorId})`);
      
      // Update all generation tasks for this batch to failed
      try {
        // First, find all tasks for this batch
        const { data: batchTasks, error: batchError } = await supabase
          .from('generation_tasks')
          .select('id, batch_index')
          .eq('batch_id', variationGroupId);
          
        if (batchError) {
          console.error(`[${executionId}] Error fetching batch tasks: ${batchError.message}`);
        } else if (batchTasks && batchTasks.length > 0) {
          console.log(`[${executionId}] Updating ${batchTasks.length} tasks to failed status`);
          
          // Update each task to failed
          for (const task of batchTasks) {
            const { error: updateError } = await supabase
              .from('generation_tasks')
              .update({
                status: 'failed',
                error_message: `OpenAI API error: ${generationError.message || 'Unknown error'}`,
                updated_at: new Date().toISOString()
              })
              .eq('id', task.id);
              
            if (updateError) {
              console.error(`[${executionId}] Error updating task ${task.id}: ${updateError.message}`);
            }
          }
        }
      } catch (updateError) {
        console.error(`[${executionId}] Error updating tasks to failed status:`, updateError);
      }
      
      return new Response(
        JSON.stringify({ 
          urls: [fallbackImageUrl],
          warning: "Used fallback image due to OpenAI API error",
          error: generationError.message,
          fallback: true,
          errorSource: "openai_api",
          errorId: errorId,
          timestamp: new Date().toISOString()
        }),
        {
          status: 200, // Return 200 even on errors to avoid CORS issues
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
    
  } catch (error) {
    console.error(`[${executionId}] Error in generate-image function:`, error);
    
    // Generate a unique error ID for tracking
    const errorId = uuidv4();
    
    // Provide a fallback image
    const fallbackImageUrl = "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/68100a4d9b154c0a40484bd8_ChatGPT%20Image%20Apr%2029%2C%202025%2C%2004_37_51%20AM.png";
    
    return new Response(
      JSON.stringify({ 
        urls: [fallbackImageUrl],
        error: error instanceof Error ? error.message : "An unexpected error occurred",
        stack: error instanceof Error ? error.stack : undefined,
        fallback: true,
        errorSource: "edge_function",
        timestamp: new Date().toISOString(),
        errorId // Include the error ID for troubleshooting
      }),
      {
        status: 200, // Return 200 even on errors to avoid CORS issues
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      }
    );
  }
});