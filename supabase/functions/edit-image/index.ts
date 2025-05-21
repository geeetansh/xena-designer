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

Deno.serve(async (req: Request) => {
  // Create a unique execution ID for this request to track through logs
  const executionId = uuidv4().substring(0, 8);
  const functionStart = Date.now();
  
  logStart(`Edit Image function started`, executionId);
  
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
        image_url_length: requestBody.image_url?.length || 0,
      })}`, executionId);
    } catch (error) {
      logError("Failed to parse request body", executionId, error);
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { 
      image_url: originalImageUrl, 
      prompt,
      edit_id = uuidv4()
    } = requestBody;
    
    // Validate input
    if (!originalImageUrl) {
      logError("Missing required parameter: image_url", executionId, { requestBody });
      return new Response(
        JSON.stringify({ error: "Missing image_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!prompt) {
      logError("Missing required parameter: prompt", executionId, { requestBody });
      return new Response(
        JSON.stringify({ error: "Missing prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download original image
    logStart(`Downloading original image from ${originalImageUrl.substring(0, 50)}...`, executionId);
    const downloadStartTime = Date.now();
    
    let originalImageBlob: Blob | null = null;
    
    try {
      // For external URLs, fetch directly
      if (!originalImageUrl.includes(supabaseUrl)) {
        const response = await fetch(originalImageUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        originalImageBlob = await response.blob();
      } else {
        // For Supabase URLs, extract bucket and path
        const urlPath = new URL(originalImageUrl).pathname;
        const parts = urlPath.split('/');
        const bucketIndex = parts.indexOf("public") + 1;
        
        if (bucketIndex <= 0) {
          throw new Error('Invalid URL format');
        }
        
        const bucket = parts[bucketIndex];
        const path = parts.slice(bucketIndex + 1).join('/');
        
        logInfo(`Extracting from Supabase storage: bucket=${bucket}, path=${path}`, executionId);
        
        // Download from Supabase Storage
        const { data, error } = await supabase.storage
          .from(bucket)
          .download(path);
          
        if (error) {
          throw new Error(`Failed to download original image: ${error.message}`);
        }
        
        if (!data) {
          throw new Error('No file data returned from storage');
        }
        
        originalImageBlob = data;
      }
      
      logComplete(`Original image downloaded (${originalImageBlob.size} bytes)`, executionId, downloadStartTime);
    } catch (downloadError) {
      logError(`Failed to download original image`, executionId, downloadError);
      return new Response(
        JSON.stringify({ error: `Failed to download original image: ${downloadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert to File object for OpenAI API
    const imageFile = new File([originalImageBlob], "original.png", { type: "image/png" });

    // Use OpenAI to edit the image
    logStart(`Calling OpenAI API to edit image`, executionId);
    const openaiStartTime = Date.now();
    
    let result;
    try {
      // Log the call we're making
      logInfo(`Using OpenAI images.edit with prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`, executionId);
      
      result = await openai.images.edit({
        model: "gpt-image-1",
        prompt: prompt,
        image: imageFile,
        quality: "high",
        size: "1024x1024"
      });
      
      logComplete(`OpenAI API call successful`, executionId, openaiStartTime);
    } catch (openaiError) {
      logError("OpenAI API error", executionId, openaiError);
      return new Response(
        JSON.stringify({ 
          error: `OpenAI API error: ${openaiError.message || "Unknown error"}`,
          success: false
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the base64 image from the response
    const editedImageBase64 = result.data[0].b64_json;
    if (!editedImageBase64) {
      logError("No image data returned from OpenAI", executionId, "Empty response");
      return new Response(
        JSON.stringify({ error: "No image data returned from OpenAI API" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    logInfo(`Received base64 image of length ${editedImageBase64.length}`, executionId);
    
    // Convert base64 to binary data
    const binaryData = Uint8Array.from(atob(editedImageBase64), char => char.charCodeAt(0));
    
    // Create a unique path for the image in storage
    const imagePath = `${userId}/edited/${edit_id}.png`;
    
    // Upload to storage
    logStart(`Uploading edited image to storage: ${imagePath}`, executionId);
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
      logError(`Failed to upload edited image`, executionId, uploadError);
      return new Response(
        JSON.stringify({ error: `Failed to upload edited image: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    logComplete(`Edited image uploaded successfully`, executionId, uploadStartTime);
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from("images")
      .getPublicUrl(imagePath);
      
    const editedImageUrl = urlData.publicUrl;
    logInfo(`Generated public URL: ${editedImageUrl}`, executionId);

    // Add the edited image to the assets table
    const { error: assetError } = await supabase
      .from("assets")
      .insert({
        user_id: userId,
        source: "generated",
        original_url: editedImageUrl,
        filename: `edited-${edit_id}.png`,
        content_type: "image/png",
        created_at: new Date().toISOString()
      });
      
    if (assetError) {
      logError(`Failed to create asset record`, executionId, assetError);
      // Non-blocking error, continue
    }

    // Prepare response object
    const responseObj = {
      success: true,
      url: editedImageUrl,
      edit_id: edit_id,
      timestamp: new Date().toISOString(),
      execution_time: ((Date.now() - functionStart) / 1000).toFixed(2) + "s"
    };
    
    logInfo(`Returning response with edited image URL`, executionId);
    logComplete(`Edit Image function completed successfully`, executionId, functionStart);

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

    return new Response(
      JSON.stringify({
        status: "error",
        success: false,
        message: error.message || "An unexpected error occurred",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        execution_time: totalDuration + "s"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});