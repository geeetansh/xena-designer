import OpenAI from "npm:openai@4.36.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { v4 as uuidv4 } from "npm:uuid@9.0.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// Initialize OpenAI with environment variables
const openai = new OpenAI({
  apiKey: Deno.env.get("VITE_OPENAI_API_KEY")
});

// Helper functions for logging
function logStart(message: string, executionId: string) {
  console.log(`[${executionId}][START] ${message}`);
}

function logComplete(message: string, executionId: string, startTime: number) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[${executionId}][COMPLETE] ${message} (${duration}s)`);
}

function logError(message: string, executionId: string, error: any) {
  console.error(`[${executionId}][ERROR] ${message}:`, error);
}

function logInfo(message: string, executionId: string) {
  console.log(`[${executionId}][INFO] ${message}`);
}

// Helper function for retrying operations
async function withRetry<T>(
  operation: () => Promise<T>, 
  maxRetries: number = 3,
  delay: number = 1000,
  operationName: string = "Operation",
  executionId: string
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // If not the first attempt, log retry attempt
      if (attempt > 1) {
        logInfo(`Retry ${attempt}/${maxRetries} for ${operationName}`, executionId);
      }
      
      return await operation();
    } catch (error) {
      lastError = error;
      logError(`Attempt ${attempt}/${maxRetries} for ${operationName} failed`, executionId, error);
      
      if (attempt < maxRetries) {
        // Wait with exponential backoff before retrying
        const waitTime = delay * Math.pow(2, attempt - 1);
        logInfo(`Waiting ${waitTime}ms before retry ${attempt+1}...`, executionId);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // If we reach here, all attempts failed
  throw lastError || new Error(`All ${maxRetries} attempts failed for ${operationName}`);
}

// Map UI size to OpenAI expected values
function mapSizeToOpenAI(size: string): string {
  switch(size) {
    case 'square':
      return '1024x1024';
    case 'landscape':
      return '1536x1024';  // Supported landscape value
    case 'portrait':
      return '1024x1536';  // Supported portrait value
    case 'auto':
    default:
      return '1024x1024'; // Default to square for auto
  }
}

Deno.serve(async (req: Request) => {
  // Create a unique execution ID for this request to track through logs
  const executionId = uuidv4().substring(0, 8);
  const functionStart = Date.now();
  
  logStart(`Generate Image function started`, executionId);
  
  // Handle CORS
  if (req.method === "OPTIONS") {
    logInfo("Handling CORS preflight request", executionId);
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    logStart("Initializing Supabase client", executionId);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    logComplete("Supabase client initialized", executionId, functionStart);

    // Get current session
    logStart("Getting auth session from request", executionId);
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      logError("No authorization header provided", executionId, "Missing header");
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: getUserError } = await supabase.auth.getUser(token);
    
    if (getUserError || !user) {
      logError("Failed to authenticate user", executionId, getUserError || "No user found");
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const userId = user.id;
    logComplete(`Auth session verified for user ${userId}`, executionId, functionStart);

    // Parse the request
    logStart("Parsing request body", executionId);
    let requestBody;
    try {
      requestBody = await req.json();
      logInfo(`Request body parsed: ${JSON.stringify({
        prompt_length: requestBody.prompt?.length || 0,
        reference_count: requestBody.reference_images?.length || 0,
        variants: requestBody.variants || 1,
        size: requestBody.size || 'auto'
      })}`, executionId);
    } catch (error) {
      logError("Failed to parse request body", executionId, error);
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { 
      reference_images: referenceImageUrls = [], 
      prompt, 
      variants = 1,
      size = 'auto'
    } = requestBody;
    
    // Validate input
    if (!prompt) {
      logError("Missing required parameter: prompt", executionId, { requestBody });
      return new Response(
        JSON.stringify({ error: "Missing prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Limit variants to reasonable range
    const numVariants = Math.min(Math.max(1, variants), 5);
    logInfo(`Generating ${numVariants} variants with prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`, executionId);
    
    // Check if user has enough credits
    logStart("Checking user credits", executionId);
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("credits")
      .eq("user_id", userId)
      .single();
      
    if (profileError) {
      logError("Error checking user credits", executionId, profileError);
      return new Response(
        JSON.stringify({ error: "Failed to retrieve user profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const userCredits = userProfile?.credits || 0;
    logInfo(`User has ${userCredits} credits`, executionId);
    
    if (userCredits < numVariants) {
      logError("Insufficient credits", executionId, { required: numVariants, available: userCredits });
      return new Response(
        JSON.stringify({ 
          error: "Insufficient credits", 
          message: `You need ${numVariants} credits but only have ${userCredits} available.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    logComplete("User has sufficient credits", executionId, functionStart);
    
    // Deduct credits upfront
    logStart("Deducting credits", executionId);
    await supabase.rpc("deduct_multiple_credits", { 
      user_id_param: userId, 
      amount: numVariants 
    });
    logComplete(`Deducted ${numVariants} credits from user ${userId}`, executionId, functionStart);
    
    // Create a new variation group ID for all images in this generation
    const variationGroupId = uuidv4();
    logInfo(`Created variation group ID: ${variationGroupId}`, executionId);
    
    // Download reference images if provided
    logStart(`Downloading ${referenceImageUrls.length} reference images`, executionId);
    const imageBlobs: Blob[] = [];
    let downloadErrors = 0;
    
    for (const url of referenceImageUrls) {
      try {
        logStart(`Downloading image from ${url.substring(0, 30)}...`, executionId);
        const imgStartTime = Date.now();
        
        // For external URLs, fetch directly
        if (!url.includes(supabaseUrl)) {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }
          const blob = await response.blob();
          imageBlobs.push(blob);
        } else {
          // For Supabase URLs, extract bucket and path
          const urlPath = new URL(url).pathname;
          const parts = urlPath.split('/');
          const bucketIndex = parts.indexOf("public") + 1;
          
          if (bucketIndex <= 0) {
            throw new Error('Invalid URL format');
          }
          
          const bucket = parts[bucketIndex];
          const path = parts.slice(bucketIndex + 1).join('/');
          
          // Download from Supabase Storage
          const { data, error } = await supabase.storage
            .from(bucket)
            .download(path);
            
          if (error) {
            throw new Error(`Failed to download reference image: ${error.message}`);
          }
          
          if (!data) {
            throw new Error('No file data returned from storage');
          }
          
          imageBlobs.push(data);
        }
        
        logComplete(`Downloaded image from ${url.substring(0, 30)}...`, executionId, imgStartTime);
      } catch (error) {
        logError(`Failed to download reference image ${url.substring(0, 30)}...`, executionId, error);
        downloadErrors++;
        // Continue with other images
      }
    }
    
    logComplete(`Downloaded ${imageBlobs.length}/${referenceImageUrls.length} reference images (${downloadErrors} errors)`, executionId, functionStart);
    
    // Generate images
    const generatedUrls: string[] = [];
    const tasks: Promise<void>[] = [];
    
    for (let i = 0; i < numVariants; i++) {
      logStart(`Generating image ${i+1} of ${numVariants}`, executionId);
      const variationStartTime = Date.now();
      
      tasks.push((async () => {
        try {
          // Convert to file objects
          const imageFiles = imageBlobs.map((blob, index) => {
            return new File([blob], `reference_${index}.png`, { type: "image/png" });
          });
          
          // Map UI size to OpenAI size format
          const openAISize = mapSizeToOpenAI(size);
          
          // Log OpenAI request parameters
          logInfo(`Calling OpenAI API: size=${openAISize}, ${imageFiles.length} reference images, prompt length=${prompt.length}`, executionId);
          const apiStartTime = Date.now();
          
          // Use OpenAI to generate image
          let result;
          
          // If we have reference images, use edit endpoint
          if (imageFiles.length > 0) {
            logInfo(`Using image edit endpoint with ${imageFiles.length} reference images`, executionId);
            
            const openaiRequest: any = {
              model: "gpt-image-1",
              prompt: prompt,
              image: imageFiles,
              quality: "high",
              size: openAISize
            };
            
            // Include detailed debug info
            logInfo(`OpenAI request params: ${JSON.stringify({
              model: openaiRequest.model,
              prompt_length: prompt.length,
              image_count: imageFiles.length,
              quality: openaiRequest.quality,
              size: openaiRequest.size
            })}`, executionId);
            
            result = await openai.images.edit(openaiRequest);
          } 
          // Otherwise use text-to-image endpoint
          else {
            logInfo(`Using text-to-image endpoint with no reference images`, executionId);
            
            const openaiRequest: any = {
              model: "gpt-image-1",
              prompt: prompt,
              quality: "high",
              size: openAISize
            };
            
            // Include detailed debug info
            logInfo(`OpenAI request params: ${JSON.stringify({
              model: openaiRequest.model,
              prompt_length: prompt.length,
              quality: openaiRequest.quality,
              size: openaiRequest.size
            })}`, executionId);
            
            result = await openai.images.generate(openaiRequest);
          }
          
          logComplete(`OpenAI API response received`, executionId, apiStartTime);
          logInfo(`OpenAI response: ${JSON.stringify({
            created: result.created,
            data_length: result.data?.length || 0
          })}`, executionId);
          
          // Get the base64 image from the response
          const generatedImageBase64 = result.data[0].b64_json;
          if (!generatedImageBase64) {
            throw new Error("No image data returned from OpenAI");
          }
          logInfo(`Received base64 image of length ${generatedImageBase64.length}`, executionId);
          
          // Convert base64 to binary data
          const binaryData = Uint8Array.from(atob(generatedImageBase64), char => char.charCodeAt(0));
          
          // Create a unique path for the image in storage
          const imagePath = `${userId}/generated/${variationGroupId}_${i}.png`;
          
          // Upload to storage
          logStart(`Uploading image to storage: ${imagePath}`, executionId);
          const uploadStartTime = Date.now();
          
          // Make sure the bucket exists
          try {
            const { data: buckets } = await supabase.storage.listBuckets();
            const bucketExists = buckets?.some(bucket => bucket.name === "images");
            
            if (!bucketExists) {
              logInfo("Creating images bucket", executionId);
              await supabase.storage.createBucket("images", {
                public: true
              });
            }
          } catch (error) {
            logError("Failed to check/create bucket", executionId, error);
          }
          
          // Upload to storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("images")
            .upload(imagePath, binaryData.buffer, {
              contentType: "image/png",
              upsert: true
            });
            
          if (uploadError) {
            throw new Error(`Failed to upload image: ${uploadError.message}`);
          }
          
          logComplete(`Image uploaded successfully`, executionId, uploadStartTime);
          
          // Get public URL
          const { data: urlData } = supabase.storage
            .from("images")
            .getPublicUrl(imagePath);
            
          const imageUrl = urlData.publicUrl;
          logInfo(`Generated public URL: ${imageUrl}`, executionId);
          
          // Save to the images table
          logStart("Saving image to database", executionId);
          const dbStartTime = Date.now();
          
          const { data: imageData, error: imageError } = await supabase
            .from("images")
            .insert({
              url: imageUrl,
              prompt,
              user_id: userId,
              variation_group_id: variationGroupId,
              variation_index: i,
              created_at: new Date().toISOString()
            })
            .select("id")
            .single();
            
          if (imageError) {
            logError("Failed to insert image record", executionId, imageError);
            throw new Error(`Failed to save image: ${imageError.message}`);
          }
          
          logComplete(`Image record saved with ID: ${imageData.id}`, executionId, dbStartTime);
          
          // Create/update generation task
          logStart("Creating generation task record", executionId);
          const taskStartTime = Date.now();
          
          const { data: taskData, error: taskError } = await supabase
            .from("generation_tasks")
            .insert({
              user_id: userId,
              prompt,
              status: "completed",
              reference_image_urls: referenceImageUrls,
              result_image_url: imageUrl,
              batch_id: variationGroupId,
              batch_index: i,
              total_in_batch: numVariants,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select("id")
            .single();
            
          if (taskError) {
            logError("Failed to create task record", executionId, taskError);
            // Non-blocking error, continue
          } else {
            logComplete(`Task record created with ID: ${taskData.id}`, executionId, taskStartTime);
          }
          
          // Also update any matching photoshoots
          logStart("Updating corresponding photoshoots", executionId);
          const photoshootStartTime = Date.now();
          
          const { error: photoshootError, count } = await supabase
            .from("photoshoots")
            .update({
              status: "completed",
              result_image_url: imageUrl,
              updated_at: new Date().toISOString()
            })
            .eq("batch_id", variationGroupId)
            .eq("batch_index", i)
            .select("count", { count: "exact" });
            
          if (photoshootError) {
            logError("Failed to update photoshoot records", executionId, photoshootError);
            // Non-blocking error, continue
          } else {
            logComplete(`Updated ${count || 0} photoshoot records`, executionId, photoshootStartTime);
          }
          
          // Also try with variation_group_id and variation_index
          logStart("Updating photoshoots via variation group ID", executionId);
          const variationUpdateStartTime = Date.now();
          
          const { error: variationUpdateError, count: variationUpdateCount } = await supabase
            .from("photoshoots")
            .update({
              status: "completed",
              result_image_url: imageUrl,
              updated_at: new Date().toISOString()
            })
            .eq("variation_group_id", variationGroupId)
            .eq("variation_index", i)
            .select("count", { count: "exact" });
            
          if (variationUpdateError) {
            logError("Failed to update photoshoot records by variation group", executionId, variationUpdateError);
            // Non-blocking error, continue
          } else {
            logComplete(`Updated ${variationUpdateCount || 0} photoshoot records by variation group`, executionId, variationUpdateStartTime);
          }
          
          // Add to the list of generated URLs
          generatedUrls.push(imageUrl);
          
          // Create asset record
          logStart("Creating asset record", executionId);
          const assetStartTime = Date.now();
          
          const { error: assetError } = await supabase
            .from("assets")
            .insert({
              user_id: userId,
              source: "generated",
              original_url: imageUrl,
              filename: `generated-${variationGroupId}-${i}.png`,
              content_type: "image/png",
              created_at: new Date().toISOString(),
              variation_group_id: variationGroupId,
              variation_index: i
            });
            
          if (assetError) {
            logError("Failed to create asset record", executionId, assetError);
            // Non-blocking error, continue
          } else {
            logComplete("Asset record created successfully", executionId, assetStartTime);
          }
          
          logComplete(`Image ${i+1} of ${numVariants} completed`, executionId, variationStartTime);
          
        } catch (variationError) {
          logError(`Failed to generate image variation ${i+1}`, executionId, variationError);
          
          // Update tasks to mark as failed
          try {
            await supabase
              .from("generation_tasks")
              .insert({
                user_id: userId,
                prompt,
                status: "failed",
                reference_image_urls: referenceImageUrls,
                error_message: String(variationError),
                batch_id: variationGroupId,
                batch_index: i,
                total_in_batch: numVariants,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            
            // Also update any matching photoshoots
            await supabase
              .from("photoshoots")
              .update({
                status: "failed",
                error_message: String(variationError),
                updated_at: new Date().toISOString()
              })
              .eq("batch_id", variationGroupId)
              .eq("batch_index", i);
              
            // Also try with variation_group_id and variation_index
            await supabase
              .from("photoshoots")
              .update({
                status: "failed",
                error_message: String(variationError),
                updated_at: new Date().toISOString()
              })
              .eq("variation_group_id", variationGroupId)
              .eq("variation_index", i);
              
          } catch (updateError) {
            logError("Failed to update tasks/photoshoots for failed generation", executionId, updateError);
          }
          
          // Continue with other variants
        }
      })());
    }
    
    // Wait for all generations to complete
    logStart(`Waiting for all ${numVariants} image generations to complete`, executionId);
    await Promise.all(tasks);
    logComplete(`All ${numVariants} images generated`, executionId, functionStart);

    // Prepare response object
    const responseObj = {
      status: "success",
      message: `Generated ${generatedUrls.length} images`,
      urls: generatedUrls,
      variationGroupId, // Include the variation group ID in the response
      timestamp: new Date().toISOString(),
      execution_time: ((Date.now() - functionStart) / 1000).toFixed(2) + "s"
    };
    
    logInfo(`Returning response with ${generatedUrls.length} image URLs`, executionId);
    logComplete(`Generate Image function completed successfully`, executionId, functionStart);

    return new Response(
      JSON.stringify(responseObj),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    const totalDuration = ((Date.now() - functionStart) / 1000).toFixed(2);
    logError(`Function failed after ${totalDuration}s`, executionId, error);

    // Create fallback image URL
    const errorMessage = error instanceof Error ? error.message : String(error);
    let fallbackImageUrl = null;
    
    try {
      // Attempt to generate a simple error image
      logStart("Creating fallback image", executionId);
      const fallbackStartTime = Date.now();
      
      // Use a simple placeholder image (small one to avoid Supabase edge function limits)
      const fallbackResult = await openai.images.generate({
        model: "gpt-image-1",
        prompt: "a simple error icon on white background, minimal, clean",
        size: "1024x1024",
        quality: "standard"
      });
      
      if (fallbackResult.data && fallbackResult.data[0].b64_json) {
        const fallbackBase64 = fallbackResult.data[0].b64_json;
        const fallbackBinary = Uint8Array.from(atob(fallbackBase64), char => char.charCodeAt(0));
        
        // Create a unique path for the fallback image
        const fallbackPath = `system/fallback/error_${Date.now()}.png`;
        
        // Upload to storage
        const { data: fallbackUpload } = await supabase.storage
          .from("images")
          .upload(fallbackPath, fallbackBinary.buffer, {
            contentType: "image/png",
            upsert: true
          });
          
        if (fallbackUpload) {
          // Get public URL
          const { data: fallbackUrlData } = supabase.storage
            .from("images")
            .getPublicUrl(fallbackPath);
            
          fallbackImageUrl = fallbackUrlData.publicUrl;
          logComplete("Created fallback image", executionId, fallbackStartTime);
        }
      }
    } catch (fallbackError) {
      logError("Failed to create fallback image", executionId, fallbackError);
      // Continue without fallback
    }

    return new Response(
      JSON.stringify({
        status: "error",
        message: errorMessage,
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fallback: fallbackImageUrl !== null,
        urls: fallbackImageUrl ? [fallbackImageUrl] : [],
        timestamp: new Date().toISOString(),
        execution_time: totalDuration + "s"
      }),
      {
        status: 200, // Return 200 even for errors to handle CORS properly
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});