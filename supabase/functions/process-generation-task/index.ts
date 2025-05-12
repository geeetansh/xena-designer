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

// Map UI size values to OpenAI expected values
function mapSizeToOpenAI(size: string): string {
  switch(size) {
    case 'square':
      return '1024x1024';
    case 'landscape':
      return '1536x1024';  // Supported landscape value
    case 'portrait':
      return '1024x1536';  // Supported portrait value
    case 'auto':
      return '1024x1024';  // Default to square for auto
    default:
      return '1024x1024'; // Default to square if not specified
  }
}

// Helper function for retrying operations
async function withRetry<T>(
  operation: () => Promise<T>, 
  maxRetries: number = 3,
  delay: number = 1000,
  operationName: string = "Operation"
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // If not the first attempt, log retry attempt
      if (attempt > 1) {
        console.log(`Retry ${attempt}/${maxRetries} for ${operationName}`);
      }
      
      return await operation();
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt}/${maxRetries} for ${operationName} failed:`, error);
      
      if (attempt < maxRetries) {
        // Wait with exponential backoff before retrying
        const waitTime = delay * Math.pow(2, attempt - 1);
        console.log(`Waiting ${waitTime}ms before retry ${attempt+1}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // If we reach here, all attempts failed
  throw lastError || new Error(`All ${maxRetries} attempts failed for ${operationName}`);
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  const executionId = uuidv4().substring(0, 8); // Shorter ID for logs
  const functionStart = Date.now();
  
  try {
    console.log(`[${executionId}] Processing generation task - Starting execution`);
    console.log(`[${executionId}] Request IP: ${req.headers.get('x-forwarded-for') || 'unknown'}`);
    console.log(`[${executionId}] Request Origin: ${req.headers.get('origin') || 'unknown'}`);
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse the request
    const { taskId, batchId, size } = await req.json();

    if (!taskId) {
      throw new Error("Missing required parameter: taskId");
    }

    console.log(`[${executionId}] Task ${taskId} in batch ${batchId || 'none'}`);

    // Get the task from the database
    const taskFetchStart = Date.now();
    const { data: task, error: taskError } = await withRetry(
      async () => supabase
        .from("generation_tasks")
        .select("*")
        .eq("id", taskId)
        .single(),
      3,
      500,
      `fetch task ${taskId}`
    );

    if (taskError) {
      throw new Error(`Failed to get task: ${taskError.message}`);
    }

    console.log(`[${executionId}] Fetched task in ${((Date.now() - taskFetchStart) / 1000).toFixed(1)}s`);
    
    // Log full task data for debugging
    console.log(`[${executionId}] Processing task ${taskId} with batch_id=${batchId} - Full task data:`, JSON.stringify({
      id: task.id,
      status: task.status,
      batch_id: task.batch_id,
      batch_index: task.batch_index,
      created_at: task.created_at,
      updated_at: task.updated_at
    }));
    
    // Check if this task is already completed or failed
    if (task.status === 'completed' || task.status === 'failed') {
      console.log(`[${executionId}] Task ${taskId} is already ${task.status}. Skipping processing.`);
      
      // Check if there's another task to process
      try {
        const { data: nextPendingTask } = await supabase
          .from("generation_tasks")
          .select("id, batch_index")
          .eq("batch_id", task.batch_id)
          .eq("status", "pending")
          .order("batch_index", { ascending: true })
          .limit(1);
          
        if (nextPendingTask && nextPendingTask.length > 0) {
          console.log(`[${executionId}] Starting next task ${nextPendingTask[0].id} instead`);
          
          await fetch(`${supabaseUrl}/functions/v1/process-generation-task`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ 
              taskId: nextPendingTask[0].id,
              batchId: task.batch_id,
              size
            })
          });
        }
      } catch (error) {
        console.error(`[${executionId}] Error finding next task:`, error);
      }
      
      return new Response(
        JSON.stringify({
          status: "success",
          message: `Task ${taskId} already ${task.status}`,
          executionId
        }),
        {
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Update task status to processing immediately
    console.log(`[${executionId}] Updating task status to processing`);
    const updateProcessingStart = Date.now();
    const { error: processingError } = await withRetry(
      async () => supabase
        .from("generation_tasks")
        .update({ 
          status: "processing", 
          updated_at: new Date().toISOString() 
        })
        .eq("id", taskId),
      3,
      500,
      `update task ${taskId} status to processing`
    );
    
    if (processingError) {
      console.error(`[${executionId}] ERROR: Failed to update task status to processing: ${processingError.message}`);
    } else {
      console.log(`[${executionId}] Successfully updated task status to processing in ${((Date.now() - updateProcessingStart) / 1000).toFixed(1)}s`);
    }

    // Also update the corresponding photoshoot to processing
    try {
      console.log(`[${executionId}] Updating photoshoot status to processing`);
      const { error: photoshootProcessingError, count } = await supabase
        .from("photoshoots")
        .update({
          status: "processing",
          updated_at: new Date().toISOString()
        })
        .eq("batch_id", task.batch_id)
        .eq("batch_index", task.batch_index)
        .select("count", { count: "exact" });
        
      if (photoshootProcessingError) {
        console.error(`[${executionId}] WARNING: Failed to update photoshoot to processing: ${photoshootProcessingError.message}`);
      } else {
        console.log(`[${executionId}] Successfully updated ${count || 0} photoshoots to processing`);
      }
    } catch (error) {
      console.error(`[${executionId}] Error updating photoshoot to processing:`, error);
      // Continue with the processing even if this fails
    }

    // Extract task details
    const { 
      prompt, 
      reference_image_urls: referenceImageUrls, 
      user_id: userId,
      batch_index = 0
    } = task;

    // Download reference images
    console.log(`[${executionId}] Downloading ${referenceImageUrls.length} reference images`);
    const downloadStart = Date.now();
    
    const imageBlobs = [];
    for (const url of referenceImageUrls) {
      try {
        // For external URLs, fetch directly
        if (!url.includes(supabaseUrl)) {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
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
          const { data: fileData, error } = await supabase.storage
            .from(bucket)
            .download(path);
            
          if (error) {
            throw new Error(`Failed to download reference image: ${error.message}`);
          }
          
          if (!fileData) {
            throw new Error('No file data returned from storage');
          }
          
          imageBlobs.push(fileData);
        }
      } catch (error) {
        console.error(`[${executionId}] Error downloading reference image ${url}:`, error);
        // Continue with other images
      }
    }

    console.log(`[${executionId}] Downloaded ${imageBlobs.length}/${referenceImageUrls.length} reference images in ${((Date.now() - downloadStart) / 1000).toFixed(1)}s`);

    try {
      // Convert to file objects
      const imageFiles = imageBlobs.map((blob, index) => {
        return new File([blob], `reference_${index}.png`, { type: "image/png" });
      });

      // Map UI size to OpenAI size format
      const openAISize = mapSizeToOpenAI(size || 'auto');

      // Use OpenAI to generate image
      console.log(`[${executionId}] Calling OpenAI API with ${imageFiles.length} images`);
      const apiStart = Date.now();
      
      let result;
      
      // If we have reference images, use edit endpoint
      if (imageFiles.length > 0) {
        const openaiRequest: any = {
          model: "gpt-image-1",
          prompt: prompt,
          image: imageFiles,
          quality: "high",
          size: openAISize
        };
        
        result = await openai.images.edit(openaiRequest);
      } 
      // Otherwise use text-to-image endpoint
      else {
        const openaiRequest: any = {
          model: "gpt-image-1",
          prompt: prompt,
          quality: "high",
          size: openAISize
        };
        
        result = await openai.images.generate(openaiRequest);
      }
      
      console.log(`[${executionId}] OpenAI API responded in ${((Date.now() - apiStart) / 1000).toFixed(1)}s`);
      
      // Get the base64 image from the response
      const generatedImageBase64 = result.data[0].b64_json;

      // Upload the generated image to Supabase Storage
      const binaryData = Uint8Array.from(atob(generatedImageBase64), char => char.charCodeAt(0));
      
      // Create path for the image: users/{userId}/generated/{taskId}.png
      const imagePath = `${userId}/generated/${taskId}.png`;
      
      console.log(`[${executionId}] Uploading generated image`);
      const uploadStart = Date.now();
      
      // Make sure the bucket exists
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(bucket => bucket.name === "images");
        
        if (!bucketExists) {
          await supabase.storage.createBucket("images", {
            public: true
          });
          console.log(`[${executionId}] Created images bucket`);
        }
      } catch (error) {
        console.error(`[${executionId}] Error checking/creating bucket:`, error);
        // Continue with upload attempt
      }
      
      // Upload to storage
      const { data: uploadData, error: uploadError } = await withRetry(
        async () => supabase.storage
          .from("images")
          .upload(imagePath, binaryData.buffer, {
            contentType: "image/png",
            upsert: true
          }),
        3,
        1000,
        "upload generated image"
      );

      if (uploadError) {
        throw new Error(`Failed to upload generated image: ${uploadError.message}`);
      }

      console.log(`[${executionId}] Image uploaded in ${((Date.now() - uploadStart) / 1000).toFixed(1)}s`);

      // Get the public URL of the uploaded image
      const { data: urlData } = supabase.storage
        .from("images")
        .getPublicUrl(imagePath);

      const storedImageUrl = urlData.publicUrl;

      // Create a new image record in the images table
      console.log(`[${executionId}] Creating database record for image`);
      const imageInsertStart = Date.now();
      
      // Create performance metrics object
      const performanceMetrics = {
        download_time: (Date.now() - downloadStart) / 1000,
        api_time: (Date.now() - apiStart) / 1000,
        upload_time: (Date.now() - uploadStart) / 1000,
        total_time: (Date.now() - functionStart) / 1000,
        images_count: imageBlobs.length
      };
      
      // Create image record
      console.log(`[${executionId}] Inserting record into images table...`);
      const { data: imageData, error: imageError } = await supabase
        .from("images")
        .insert({
          url: storedImageUrl,
          prompt,
          user_id: userId,
          raw_json: JSON.stringify({
            input: {
              prompt,
              referenceImageUrls,
              size
            },
            output: result,
            processing: {
              steps: [
                "1. Retrieved task from database",
                "2. Downloaded reference images",
                `3. Generated image with OpenAI (size: ${openAISize})`,
                "4. Uploaded result to storage"
              ],
              performance: performanceMetrics
            }
          }),
          variation_group_id: task.batch_id,
          variation_index: task.batch_index,
          created_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (imageError) {
        console.error(`[${executionId}] ERROR: Failed to insert image record: ${imageError.message}`);
        throw new Error(`Failed to save image: ${imageError.message}`);
      }
      
      console.log(`[${executionId}] Successfully inserted image record with ID: ${imageData.id} in ${((Date.now() - imageInsertStart) / 1000).toFixed(1)}s`);

      // Update the task with the result
      console.log(`[${executionId}] Updating task status to completed`);
      const updateTaskStart = Date.now();
      
      const { error: taskUpdateError } = await supabase
        .from("generation_tasks")
        .update({
          status: "completed",
          result_image_url: storedImageUrl,
          raw_response: JSON.stringify(result),
          updated_at: new Date().toISOString()
        })
        .eq("id", taskId);
        
      if (taskUpdateError) {
        console.error(`[${executionId}] ERROR: Failed to update generation_tasks record: ${taskUpdateError.message}`);
        console.error(`[${executionId}] Task update SQL params: { id: "${taskId}", status: "completed", url: "${storedImageUrl.substring(0, 30)}..." }`);
      } else {
        console.log(`[${executionId}] Successfully updated generation_tasks record in ${((Date.now() - updateTaskStart) / 1000).toFixed(1)}s`);
      }

      // Update any related photoshoots
      console.log(`[${executionId}] Updating related photoshoots with batch_id ${batchId} and batch_index ${task.batch_index}`);
      const updatePhotoshootsStart = Date.now();
      
      const { error: photoshootUpdateError, count } = await supabase
        .from("photoshoots")
        .update({
          status: "completed",
          result_image_url: storedImageUrl,
          updated_at: new Date().toISOString()
        })
        .eq("batch_id", batchId)
        .eq("batch_index", task.batch_index)
        .select("count", { count: "exact" });
        
      if (photoshootUpdateError) {
        console.error(`[${executionId}] ERROR: Failed to update photoshoots record: ${photoshootUpdateError.message}`);
        console.error(`[${executionId}] Photoshoot update SQL params: { batch_id: "${batchId}", batch_index: ${task.batch_index}, status: "completed", url: "${storedImageUrl.substring(0, 30)}..." }`);
      } else {
        console.log(`[${executionId}] Successfully updated ${count || 0} photoshoots records in ${((Date.now() - updatePhotoshootsStart) / 1000).toFixed(1)}s`);
        
        // Double-check that photoshoot was updated by checking its status
        try {
          const { data: photoshootCheck } = await supabase
            .from("photoshoots")
            .select("id, status")
            .eq("batch_id", batchId)
            .eq("batch_index", task.batch_index);
            
          if (photoshootCheck && photoshootCheck.length > 0) {
            console.log(`[${executionId}] Photoshoot ${photoshootCheck[0].id} status is now: ${photoshootCheck[0].status}`);
          } else {
            console.log(`[${executionId}] WARNING: Could not find photoshoot record to verify status update`);
          }
        } catch (checkError) {
          console.error(`[${executionId}] Error checking photoshoot status:`, checkError);
        }
      }

      // Also add the image to the assets table
      const { error: assetError } = await supabase
        .from("assets")
        .insert({
          user_id: userId,
          source: "generated",
          original_url: storedImageUrl,
          filename: `generated-${new Date().toISOString()}.png`,
          content_type: "image/png",
          created_at: new Date().toISOString(),
          variation_group_id: task.batch_id,
          variation_index: task.batch_index
        });
      
      if (assetError) {
        console.error(`[${executionId}] ERROR: Failed to insert asset record: ${assetError.message}`);
      } else {
        console.log(`[${executionId}] Successfully inserted asset record`);
      }

      // Save reference images if any
      if (referenceImageUrls.length > 0) {
        console.log(`[${executionId}] Saving ${referenceImageUrls.length} reference images`);
        const saveRefImagesStart = Date.now();
        
        const referenceImagesData = referenceImageUrls.map(url => ({
          image_id: imageData.id,
          url
        }));
        
        const { error: refImagesError } = await supabase
          .from("reference_images")
          .insert(referenceImagesData);
          
        if (refImagesError) {
          console.error(`[${executionId}] ERROR: Failed to insert reference_images records: ${refImagesError.message}`);
        } else {
          console.log(`[${executionId}] Successfully inserted ${referenceImageUrls.length} reference_images records in ${((Date.now() - saveRefImagesStart) / 1000).toFixed(1)}s`);
        }
      }

      // Process the next task in the batch if applicable
      try {
        console.log(`[${executionId}] Checking for next task in batch ${batchId}`);
        
        // Get all the tasks in this batch
        const { data: batchTasks, error: batchError } = await supabase
          .from("generation_tasks")
          .select("*")
          .eq("batch_id", batchId)
          .order("batch_index", { ascending: true });

        if (!batchError && batchTasks) {
          // Find the next pending task
          const nextTask = batchTasks.find(t => 
            t.status === "pending" && t.id !== taskId
          );

          if (nextTask) {
            console.log(`[${executionId}] Starting next task ${nextTask.id}`);
            
            await fetch(`${supabaseUrl}/functions/v1/process-generation-task`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({ 
                taskId: nextTask.id,
                batchId,
                size
              })
            });
          } else {
            console.log(`[${executionId}] All tasks in batch ${batchId} have been processed`);
          }
        }
      } catch (nextTaskError) {
        console.error(`[${executionId}] Error starting next task:`, nextTaskError);
        // Continue with response - this error shouldn't fail the current task
      }

      console.log(`[${executionId}] Task completed in ${((Date.now() - functionStart) / 1000).toFixed(1)}s total`);

      return new Response(
        JSON.stringify({
          status: "success",
          message: "Image generated successfully",
          task_id: taskId,
          image_url: storedImageUrl,
          image_id: imageData.id,
          execution_id: executionId
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    } catch (generationError) {
      console.error(`[${executionId}] Error generating image:`, generationError);
      
      // Update the task status to failed
      const failedTaskStart = Date.now();
      console.log(`[${executionId}] Updating task status to failed`);
      
      const { error: taskFailedError } = await supabase
        .from("generation_tasks")
        .update({
          status: "failed",
          error_message: generationError.message || "Unknown error",
          updated_at: new Date().toISOString()
        })
        .eq("id", taskId);
        
      if (taskFailedError) {
        console.error(`[${executionId}] ERROR: Failed to update task status to failed: ${taskFailedError.message}`);
      } else {
        console.log(`[${executionId}] Successfully updated task status to failed in ${((Date.now() - failedTaskStart) / 1000).toFixed(1)}s`);
      }
      
      // Update any related photoshoots as failed
      console.log(`[${executionId}] Updating related photoshoots to failed status`);
      const failedPhotoshootsStart = Date.now();
      
      const { error: photoshootFailedError, count } = await supabase
        .from("photoshoots")
        .update({
          status: "failed",
          error_message: `Error: ${generationError.message || "Unknown error"}`,
          updated_at: new Date().toISOString()
        })
        .eq("batch_id", batchId)
        .eq("batch_index", task.batch_index)
        .select("count", { count: "exact" });
        
      if (photoshootFailedError) {
        console.error(`[${executionId}] ERROR: Failed to update photoshoots status to failed: ${photoshootFailedError.message}`);
      } else {
        console.log(`[${executionId}] Successfully updated ${count || 0} photoshoots to failed status in ${((Date.now() - failedPhotoshootsStart) / 1000).toFixed(1)}s`);
      }
      
      // Try to process the next task in the batch
      try {
        console.log(`[${executionId}] Checking for next task in batch after failure`);
        
        const { data: batchTasks } = await supabase
          .from("generation_tasks")
          .select("*")
          .eq("batch_id", batchId)
          .order("batch_index", { ascending: true });

        if (batchTasks) {
          const nextTask = batchTasks.find(t => 
            t.status === "pending" && t.id !== taskId
          );

          if (nextTask) {
            console.log(`[${executionId}] Starting next task ${nextTask.id} after failure`);
            
            await fetch(`${supabaseUrl}/functions/v1/process-generation-task`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({ 
                taskId: nextTask.id,
                batchId,
                size
              })
            });
          } else {
            console.log(`[${executionId}] No more pending tasks in batch ${batchId}`);
          }
        }
      } catch (nextTaskError) {
        console.error(`[${executionId}] Error starting next task after failure:`, nextTaskError);
      }
      
      return new Response(
        JSON.stringify({
          status: "error",
          message: generationError.message || "Failed to generate image",
          error: String(generationError),
          task_id: taskId,
          execution_time: ((Date.now() - functionStart) / 1000).toFixed(1)
        }),
        {
          status: 200, // Return 200 even on errors to avoid CORS issues
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

  } catch (error) {
    console.error(`[${executionId}] Error processing task:`, error);

    return new Response(
      JSON.stringify({
        status: "error",
        message: error.message || "An unexpected error occurred",
        error: String(error),
        execution_id: executionId,
        execution_time: ((Date.now() - functionStart) / 1000).toFixed(1)
      }),
      {
        status: 200, // Return 200 even on errors to avoid CORS issues
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});