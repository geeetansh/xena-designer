import OpenAI from "npm:openai@4.98.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { v4 as uuidv4 } from "npm:uuid@9.0.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-auth"
};

// Initialize OpenAI with environment variables
const openai = new OpenAI({
  apiKey: Deno.env.get("VITE_OPENAI_API_KEY")
});

/**
 * Downloads an image from a URL and returns it as a Blob
 * This function handles both external URLs and Supabase storage URLs
 */
async function downloadImageFromUrl(url: string, supabase: any, supabaseUrl: string, executionId: string): Promise<Blob | null> {
  try {
    console.log(`[${executionId}] Downloading image from: ${url.substring(0, 50)}...`);
    const downloadStart = Date.now();
    
    // For external URLs, fetch directly
    if (!url.includes(supabaseUrl)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      const blob = await response.blob();
      console.log(`[${executionId}] Downloaded external image (${blob.size} bytes) in ${((Date.now() - downloadStart) / 1000).toFixed(2)}s`);
      return blob;
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
      
      console.log(`[${executionId}] Extracting from Supabase storage: bucket=${bucket}, path=${path}`);
      
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
      
      console.log(`[${executionId}] Downloaded image from Supabase storage in ${((Date.now() - downloadStart) / 1000).toFixed(2)}s`);
      return data;
    }
  } catch (error) {
    console.error(`[${executionId}] ERROR downloading image from ${url}:`, error);
    return null;
  }
}

/**
 * Prepares images for OpenAI by downloading them and converting to File objects
 */
async function prepareImagesForOpenAI(imageUrls: string[], supabase: any, supabaseUrl: string, executionId: string): Promise<File[]> {
  console.log(`[${executionId}] Preparing ${imageUrls.length} images for OpenAI`);
  const prepStart = Date.now();
  
  const imageBlobs: Array<Blob | null> = await Promise.all(
    imageUrls.map(url => downloadImageFromUrl(url, supabase, supabaseUrl, executionId))
  );
  
  // Filter out null blobs and convert to File objects
  const files = imageBlobs
    .filter((blob): blob is Blob => blob !== null)
    .map((blob, index) => {
      return new File([blob], `reference_${index}.png`, { type: "image/png" });
    });
    
  console.log(`[${executionId}] Successfully prepared ${files.length}/${imageUrls.length} images in ${((Date.now() - prepStart) / 1000).toFixed(2)}s`);
  return files;
}

/**
 * Maps layout type to OpenAI supported size
 */
function mapLayoutToOpenAISize(layout: string): string {
  switch(layout) {
    case 'square':
      return '1024x1024';
    case 'landscape':
      return '1536x1024';
    case 'portrait':
      return '1024x1536';
    case 'auto':
    default:
      return 'auto';
  }
}

Deno.serve(async (req: Request) => {
  // Generate unique execution ID for logging
  const executionId = uuidv4().substring(0, 8);
  const functionStart = Date.now();
  
  console.log(`[${executionId}] ===== STARTING GENERATION JOB PROCESSING =====`);
  console.log(`[${executionId}] Request method: ${req.method}`);
  console.log(`[${executionId}] Request IP: ${req.headers.get('x-forwarded-for') || 'unknown'}`);
  console.log(`[${executionId}] Request Origin: ${req.headers.get('origin') || 'unknown'}`);
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log(`[${executionId}] Handling CORS preflight request`);
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    // Initialize Supabase client
    console.log(`[${executionId}] Initializing Supabase client`);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !supabaseKey) {
      console.error(`[${executionId}] Missing Supabase environment variables`);
      return new Response(
        JSON.stringify({ error: "Missing Supabase environment variables" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Parse the request
    console.log(`[${executionId}] Parsing request body`);
    let requestData;
    try {
      requestData = await req.json();
      console.log(`[${executionId}] Request body parsed successfully`);
    } catch (error) {
      console.error(`[${executionId}] Error parsing request body:`, error);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { variationId } = requestData;
    console.log(`[${executionId}] Processing variation ID: ${variationId}`);
    
    if (!variationId) {
      console.error(`[${executionId}] Missing required parameter: variationId`);
      return new Response(
        JSON.stringify({ error: "Variation ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Fetch the variation and job
    console.log(`[${executionId}] Fetching variation and session data`);
    const fetchStart = Date.now();
    const { data: variation, error: variationError } = await supabase
      .from('prompt_variations')
      .select(`
        id, 
        prompt, 
        session_id, 
        automation_sessions!inner(
          product_image_url, 
          brand_logo_url, 
          reference_ad_url,
          layout
        )
      `)
      .eq('id', variationId)
      .single();
    
    if (variationError) {
      console.error(`[${executionId}] Error fetching variation:`, variationError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch variation: ${variationError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[${executionId}] Variation fetched successfully in ${((Date.now() - fetchStart) / 1000).toFixed(2)}s`);
    console.log(`[${executionId}] Session ID: ${variation.session_id}`);
    console.log(`[${executionId}] Prompt length: ${variation.prompt.length} characters`);
    console.log(`[${executionId}] Layout: ${variation.automation_sessions.layout || 'auto'}`);
    
    // Find the job
    console.log(`[${executionId}] Fetching job data`);
    const jobFetchStart = Date.now();
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .select('*')
      .eq('variation_id', variationId)
      .single();
    
    if (jobError) {
      console.error(`[${executionId}] Error fetching job:`, jobError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch job: ${jobError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[${executionId}] Job fetched successfully in ${((Date.now() - jobFetchStart) / 1000).toFixed(2)}s`);
    console.log(`[${executionId}] Job ID: ${job.id}, Status: ${job.status}`);
    
    // Update job status to in_progress
    console.log(`[${executionId}] Updating job status to in_progress`);
    const updateJobStart = Date.now();
    const { error: updateJobError } = await supabase
      .from('generation_jobs')
      .update({ 
        status: 'in_progress',
        updated_at: new Date().toISOString() 
      })
      .eq('id', job.id);
      
    if (updateJobError) {
      console.error(`[${executionId}] Error updating job status:`, updateJobError);
    } else {
      console.log(`[${executionId}] Job status updated successfully in ${((Date.now() - updateJobStart) / 1000).toFixed(2)}s`);
    }
    
    // Update variation status
    console.log(`[${executionId}] Updating variation status to in_progress`);
    const updateVarStart = Date.now();
    const { error: updateVariationError } = await supabase
      .from('prompt_variations')
      .update({ 
        status: 'in_progress',
        updated_at: new Date().toISOString() 
      })
      .eq('id', variationId);
      
    if (updateVariationError) {
      console.error(`[${executionId}] Error updating variation status:`, updateVariationError);
    } else {
      console.log(`[${executionId}] Variation status updated successfully in ${((Date.now() - updateVarStart) / 1000).toFixed(2)}s`);
    }
    
    // Begin gathering reference images
    console.log(`[${executionId}] Preparing reference images`);
    const session = variation.automation_sessions;
    const referenceUrls = [];
    
    // Add product image
    if (session.product_image_url) {
      console.log(`[${executionId}] Adding product image: ${session.product_image_url.substring(0, 50)}...`);
      referenceUrls.push(session.product_image_url);
    }
    
    // Add brand logo if provided
    if (session.brand_logo_url) {
      console.log(`[${executionId}] Adding brand logo: ${session.brand_logo_url.substring(0, 50)}...`);
      referenceUrls.push(session.brand_logo_url);
    }
    
    // Add reference ad if provided
    if (session.reference_ad_url) {
      console.log(`[${executionId}] Adding reference ad: ${session.reference_ad_url.substring(0, 50)}...`);
      referenceUrls.push(session.reference_ad_url);
    }
    
    // Download reference images using our helper function
    console.log(`[${executionId}] Downloading ${referenceUrls.length} reference images`);
    const downloadStart = Date.now();
    const imageFiles = await prepareImagesForOpenAI(referenceUrls, supabase, supabaseUrl, executionId);
    console.log(`[${executionId}] Prepared ${imageFiles.length}/${referenceUrls.length} images in ${((Date.now() - downloadStart) / 1000).toFixed(2)}s`);
    
    try {
      // Get the layout from session or default to 'auto'
      const layout = session.layout || 'auto';
      
      // Map the layout to OpenAI size format
      const openAISize = mapLayoutToOpenAISize(layout);
      console.log(`[${executionId}] Using layout: ${layout}, OpenAI size: ${openAISize}`);
      
      // Call OpenAI to generate image
      console.log(`[${executionId}] Calling OpenAI API to generate image`);
      console.log(`[${executionId}] Using prompt (first 100 chars): ${variation.prompt.substring(0, 100)}...`);
      console.log(`[${executionId}] Using ${imageFiles.length} reference images`);
      
      const apiStart = Date.now();
      let result;
      
      // If we have reference images, use edit endpoint
      if (imageFiles.length > 0) {
        console.log(`[${executionId}] Using OpenAI images.edit endpoint with reference images`);
        result = await openai.images.edit({
          model: "gpt-image-1",
          prompt: variation.prompt,
          image: imageFiles,
          quality: "high",
          size: openAISize
        });
      } 
      // Otherwise use text-to-image endpoint
      else {
        console.log(`[${executionId}] Using OpenAI images.generate endpoint (no reference images)`);
        result = await openai.images.generate({
          model: "gpt-image-1",
          prompt: variation.prompt,
          quality: "high",
          size: openAISize
        });
      }
      
      console.log(`[${executionId}] OpenAI API call completed in ${((Date.now() - apiStart) / 1000).toFixed(2)}s`);
      console.log(`[${executionId}] API response contains ${result.data.length} image(s)`);
      
      // Get the base64 image from the response
      const generatedImageBase64 = result.data[0].b64_json;
      if (!generatedImageBase64) {
        console.error(`[${executionId}] OpenAI response doesn't contain image data`);
        throw new Error("No image data returned from OpenAI");
      }
      
      console.log(`[${executionId}] Successfully received base64 image data (${generatedImageBase64.length} chars)`);
      
      // Convert base64 to binary data
      console.log(`[${executionId}] Converting base64 to binary data`);
      const conversionStart = Date.now();
      const binaryData = Uint8Array.from(atob(generatedImageBase64), char => char.charCodeAt(0));
      console.log(`[${executionId}] Converted base64 to binary data (${binaryData.length} bytes) in ${((Date.now() - conversionStart) / 1000).toFixed(2)}s`);
      
      // Create a unique path for the image
      console.log(`[${executionId}] Getting user ID to create storage path`);
      const { data: sessionData } = await supabase.auth.getSession();
      let userId = sessionData?.session?.user?.id;
      
      if (!userId) {
        // Try to get the user ID from the automation session
        console.log(`[${executionId}] No authenticated user, fetching user ID from session`);
        const { data: sessionInfo } = await supabase
          .from('automation_sessions')
          .select('user_id')
          .eq('id', variation.session_id)
          .single();
          
        if (!sessionInfo?.user_id) {
          console.error(`[${executionId}] Failed to determine user ID`);
          throw new Error("Failed to determine user ID");
        }
        
        userId = sessionInfo.user_id;
        console.log(`[${executionId}] Retrieved user ID: ${userId.substring(0, 8)}...`);
      }
      
      const imagePath = `${userId}/automated/${variation.session_id}/${variation.id}.png`;
      console.log(`[${executionId}] Storage path: automated/${imagePath}`);
      
      // Make sure the bucket exists
      console.log(`[${executionId}] Checking if 'automated' storage bucket exists`);
      const bucketStart = Date.now();
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(bucket => bucket.name === "automated");
        
        if (!bucketExists) {
          console.log(`[${executionId}] 'automated' bucket doesn't exist, creating it`);
          await supabase.storage.createBucket("automated", {
            public: true
          });
          console.log(`[${executionId}] 'automated' bucket created successfully`);
        } else {
          console.log(`[${executionId}] 'automated' bucket already exists`);
        }
      } catch (error) {
        console.error(`[${executionId}] Error checking/creating bucket:`, error);
        // Continue anyway, since the bucket might still work
      }
      
      console.log(`[${executionId}] Bucket check completed in ${((Date.now() - bucketStart) / 1000).toFixed(2)}s`);
      
      // Upload to storage
      console.log(`[${executionId}] Uploading image to storage`);
      const uploadStart = Date.now();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("automated")
        .upload(imagePath, binaryData, {
          contentType: "image/png",
          upsert: true
        });
        
      if (uploadError) {
        console.error(`[${executionId}] Error uploading image:`, uploadError);
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }
      
      console.log(`[${executionId}] Image uploaded successfully in ${((Date.now() - uploadStart) / 1000).toFixed(2)}s`);
      
      // Get public URL
      console.log(`[${executionId}] Getting public URL for the uploaded image`);
      const { data: urlData } = supabase.storage
        .from("automated")
        .getPublicUrl(imagePath);
        
      const imageUrl = urlData.publicUrl;
      console.log(`[${executionId}] Image public URL: ${imageUrl}`);
      
      // Update the job with the result
      console.log(`[${executionId}] Updating job with image URL`);
      const jobUpdateStart = Date.now();
      const { error: jobUpdateError } = await supabase
        .from('generation_jobs')
        .update({
          status: 'completed',
          image_url: imageUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);
        
      if (jobUpdateError) {
        console.error(`[${executionId}] Error updating job:`, jobUpdateError);
      } else {
        console.log(`[${executionId}] Job updated successfully in ${((Date.now() - jobUpdateStart) / 1000).toFixed(2)}s`);
      }
        
      // Update the variation status
      console.log(`[${executionId}] Updating variation status to completed`);
      const varUpdateStart = Date.now();
      const { error: varUpdateError } = await supabase
        .from('prompt_variations')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', variationId);
        
      if (varUpdateError) {
        console.error(`[${executionId}] Error updating variation:`, varUpdateError);
      } else {
        console.log(`[${executionId}] Variation updated successfully in ${((Date.now() - varUpdateStart) / 1000).toFixed(2)}s`);
      }
      
      // Check if this was the last job for this session
      console.log(`[${executionId}] Checking if this was the last job for this session`);
      // First, get all the variation IDs for this session
      const checkStart = Date.now();
      const { data: variationIds, error: variationIdsError } = await supabase
        .from('prompt_variations')
        .select('id')
        .eq('session_id', variation.session_id);
      
      if (variationIdsError) {
        console.error(`[${executionId}] Error fetching variation IDs:`, variationIdsError);
      } else if (variationIds && variationIds.length > 0) {
        // Extract the IDs as an array
        const ids = variationIds.map(v => v.id);
        console.log(`[${executionId}] Session has ${ids.length} total variations`);
        
        // Now query for queued jobs with these variation IDs
        const { data: remainingJobs, error: countError } = await supabase
          .from('generation_jobs')
          .select('id', { count: 'exact' })
          .eq('status', 'queued')
          .in('variation_id', ids);
        
        if (countError) {
          console.error(`[${executionId}] Error checking remaining jobs:`, countError);
        } else {
          const remainingCount = remainingJobs?.length || 0;
          console.log(`[${executionId}] ${remainingCount} jobs remaining to process`);
          
          // If there are more jobs, start the next one
          if (remainingCount > 0) {
            // Find the next job
            console.log(`[${executionId}] Finding next variation to process`);
            const { data: nextVariation, error: nextError } = await supabase
              .from('prompt_variations')
              .select('id')
              .eq('session_id', variation.session_id)
              .eq('status', 'ready')
              .order('index')
              .limit(1);
              
            if (nextError) {
              console.error(`[${executionId}] Error finding next variation:`, nextError);
            } else if (nextVariation && nextVariation.length > 0) {
              // Process the next job
              console.log(`[${executionId}] Starting next job for variation: ${nextVariation[0].id}`);
              try {
                await fetch(`${supabaseUrl}/functions/v1/process-generation-job`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseKey}`
                  },
                  body: JSON.stringify({ 
                    variationId: nextVariation[0].id
                  })
                });
                console.log(`[${executionId}] Next job triggered successfully`);
              } catch (nextJobError) {
                console.error(`[${executionId}] Error triggering next job:`, nextJobError);
              }
            } else {
              console.log(`[${executionId}] No next variation found despite having remaining jobs`);
            }
          } else {
            // All jobs are complete, update the session status
            console.log(`[${executionId}] All jobs complete, updating session status to completed`);
            const sessionUpdateStart = Date.now();
            const { error: sessionUpdateError } = await supabase
              .from('automation_sessions')
              .update({
                status: 'completed',
                updated_at: new Date().toISOString()
              })
              .eq('id', variation.session_id);
              
            if (sessionUpdateError) {
              console.error(`[${executionId}] Error updating session status:`, sessionUpdateError);
            } else {
              console.log(`[${executionId}] Session status updated successfully in ${((Date.now() - sessionUpdateStart) / 1000).toFixed(2)}s`);
            }
          }
        }
      }
      
      console.log(`[${executionId}] Final checks completed in ${((Date.now() - checkStart) / 1000).toFixed(2)}s`);
      console.log(`[${executionId}] ===== JOB PROCESSING COMPLETED SUCCESSFULLY in ${((Date.now() - functionStart) / 1000).toFixed(2)}s =====`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          imageUrl,
          executionId,
          executionTimeSeconds: ((Date.now() - functionStart) / 1000).toFixed(2)
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
      
    } catch (imageError) {
      console.error(`[${executionId}] Error generating image:`, imageError);
      console.log(`[${executionId}] ERROR STACK: ${imageError.stack || 'No stack available'}`);
      
      // Update job status to failed
      console.log(`[${executionId}] Updating job status to failed`);
      const errorUpdateStart = Date.now();
      const { error: jobUpdateError } = await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: imageError.message || "Unknown error",
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);
        
      if (jobUpdateError) {
        console.error(`[${executionId}] Error updating job to failed status:`, jobUpdateError);
      } else {
        console.log(`[${executionId}] Job updated to failed status in ${((Date.now() - errorUpdateStart) / 1000).toFixed(2)}s`);
      }
        
      // Update variation status
      console.log(`[${executionId}] Updating variation status to failed`);
      const varErrorUpdateStart = Date.now();
      const { error: varUpdateError } = await supabase
        .from('prompt_variations')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', variationId);
        
      if (varUpdateError) {
        console.error(`[${executionId}] Error updating variation to failed status:`, varUpdateError);
      } else {
        console.log(`[${executionId}] Variation updated to failed status in ${((Date.now() - varErrorUpdateStart) / 1000).toFixed(2)}s`);
      }
      
      // Try to start the next job
      try {
        console.log(`[${executionId}] Attempting to find and start next job despite failure`);
        const { data: nextVariation } = await supabase
          .from('prompt_variations')
          .select('id')
          .eq('session_id', variation.session_id)
          .eq('status', 'ready')
          .order('index')
          .limit(1);
          
        if (nextVariation && nextVariation.length > 0) {
          console.log(`[${executionId}] Starting next job for variation: ${nextVariation[0].id}`);
          try {
            await fetch(`${supabaseUrl}/functions/v1/process-generation-job`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({ 
                variationId: nextVariation[0].id
              })
            });
            console.log(`[${executionId}] Next job triggered successfully despite current failure`);
          } catch (nextJobError) {
            console.error(`[${executionId}] Error triggering next job:`, nextJobError);
          }
        }
      } catch (nextVariationError) {
        console.error(`[${executionId}] Error finding next variation:`, nextVariationError);
      }
      
      console.log(`[${executionId}] ===== JOB PROCESSING FAILED in ${((Date.now() - functionStart) / 1000).toFixed(2)}s =====`);
      
      return new Response(
        JSON.stringify({ 
          error: `Image generation failed: ${imageError.message}`,
          executionId,
          executionTimeSeconds: ((Date.now() - functionStart) / 1000).toFixed(2)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

  } catch (error) {
    console.error(`[${executionId}] Unhandled error in process-generation-job:`, error);
    console.log(`[${executionId}] ERROR STACK: ${error.stack || 'No stack available'}`);
    console.log(`[${executionId}] ===== FUNCTION EXECUTION FAILED in ${((Date.now() - functionStart) / 1000).toFixed(2)}s =====`);

    return new Response(
      JSON.stringify({
        status: "error",
        message: error.message || "An unexpected error occurred",
        error: String(error),
        executionId,
        executionTimeSeconds: ((Date.now() - functionStart) / 1000).toFixed(2)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});