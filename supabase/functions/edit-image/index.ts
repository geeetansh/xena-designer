import OpenAI from "npm:openai@4.98.0";
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

/**
 * Downloads an image from a URL and returns it as a Blob
 */
async function downloadImageFromUrl(url: string, supabase: any, supabaseUrl: string): Promise<Blob | null> {
  try {
    console.log(`Downloading image from: ${url.substring(0, 50)}...`);
    
    // For external URLs, fetch directly
    if (!url.includes(supabaseUrl)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      const blob = await response.blob();
      console.log(`Downloaded external image (${blob.size} bytes)`);
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
      
      console.log(`Extracting from Supabase storage: bucket=${bucket}, path=${path}`);
      
      // Download from Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(path);
        
      if (error) {
        throw new Error(`Failed to download image: ${error.message}`);
      }
      
      if (!data) {
        throw new Error('No file data returned from storage');
      }
      
      console.log(`Downloaded image from Supabase storage`);
      return data;
    }
  } catch (error) {
    console.error(`ERROR downloading image:`, error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  const executionId = uuidv4().substring(0, 8);
  const functionStart = Date.now();
  
  console.log(`[${executionId}] Edit Image function started`);

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current session
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: getUserError } = await supabase.auth.getUser(token);
    
    if (getUserError || !user) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const userId = user.id;
    console.log(`[${executionId}] Processing edit request for user ${userId}`);

    // Parse the request
    const { editId, originalImageUrl, editPrompt } = await req.json();
    
    if (!editId || !originalImageUrl || !editPrompt) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: editId, originalImageUrl, or editPrompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[${executionId}] Edit ID: ${editId}`);
    console.log(`[${executionId}] Original Image URL: ${originalImageUrl.substring(0, 50)}...`);
    console.log(`[${executionId}] Edit Prompt: ${editPrompt.substring(0, 100)}...`);

    try {
      // Update edited_images record to processing state
      const { error: updateError } = await supabase
        .from('edited_images')
        .update({ 
          status: 'processing',
          updated_at: new Date().toISOString() 
        })
        .eq('id', editId);
      
      if (updateError) {
        console.error(`[${executionId}] Error updating edited_images status:`, updateError);
        throw new Error(`Failed to update edited_images status: ${updateError.message}`);
      }

      // Download the original image
      console.log(`[${executionId}] Downloading original image`);
      const imageBlob = await downloadImageFromUrl(originalImageUrl, supabase, supabaseUrl);
      
      if (!imageBlob) {
        throw new Error("Failed to download original image");
      }
      
      // Create a File object from the blob
      const imageFile = new File([imageBlob], "original.png", { type: "image/png" });
      
      console.log(`[${executionId}] Calling OpenAI API to edit image`);
      const result = await openai.images.edit({
        model: "gpt-image-1",
        prompt: `Edit this image based on these instructions: ${editPrompt}`,
        image: imageFile,
        quality: "high"
      });
      
      console.log(`[${executionId}] OpenAI API response received`);
      
      // Get the base64 image from the response
      const editedImageBase64 = result.data[0].b64_json;
      if (!editedImageBase64) {
        throw new Error("No image data returned from OpenAI");
      }
      
      // Convert base64 to binary data
      const binaryData = Uint8Array.from(atob(editedImageBase64), char => char.charCodeAt(0));
      
      // Create a unique path for the image in storage
      const imagePath = `${userId}/edited/${editId}.png`;
      
      // Make sure the bucket exists
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(bucket => bucket.name === "edited_images");
        
        if (!bucketExists) {
          await supabase.storage.createBucket("edited_images", {
            public: true
          });
        }
      } catch (error) {
        console.error(`[${executionId}] Error checking/creating bucket:`, error);
        // Continue anyway
      }
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("edited_images")
        .upload(imagePath, binaryData.buffer, {
          contentType: "image/png",
          upsert: true
        });
        
      if (uploadError) {
        throw new Error(`Failed to upload edited image: ${uploadError.message}`);
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from("edited_images")
        .getPublicUrl(imagePath);
        
      const editedImageUrl = urlData.publicUrl;
      
      // Update the edited_images record with the result
      const { error: completeError } = await supabase
        .from('edited_images')
        .update({
          status: 'completed',
          image_url: editedImageUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', editId);
        
      if (completeError) {
        throw new Error(`Failed to update edited_images record: ${completeError.message}`);
      }
      
      // Also create an asset record for the edited image
      await supabase
        .from("assets")
        .insert({
          user_id: userId,
          source: "generated",
          original_url: editedImageUrl,
          filename: `edited-${editId}.png`,
          content_type: "image/png",
          created_at: new Date().toISOString()
        });
      
      console.log(`[${executionId}] Edit completed successfully`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          editId,
          imageUrl: editedImageUrl,
          executionTime: ((Date.now() - functionStart) / 1000).toFixed(2) + "s"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
      
    } catch (editError) {
      console.error(`[${executionId}] Error editing image:`, editError);
      
      // Update the edited_images record with the error
      const { error: failureError } = await supabase
        .from('edited_images')
        .update({
          status: 'failed',
          error_message: String(editError),
          updated_at: new Date().toISOString()
        })
        .eq('id', editId);
        
      if (failureError) {
        console.error(`[${executionId}] Error updating edited_images failure status:`, failureError);
      }
      
      return new Response(
        JSON.stringify({ 
          error: `Image editing failed: ${editError instanceof Error ? editError.message : String(editError)}`,
          executionTime: ((Date.now() - functionStart) / 1000).toFixed(2) + "s"
        }),
        {
          status: 200, // Return 200 even for errors to handle CORS properly
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

  } catch (error) {
    console.error(`[${executionId}] Error in edit-image:`, error);

    return new Response(
      JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        error: String(error),
        executionTime: ((Date.now() - functionStart) / 1000).toFixed(2) + "s"
      }),
      {
        status: 200, // Return 200 even for errors to handle CORS properly
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});