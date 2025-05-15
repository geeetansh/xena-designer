import OpenAI from "npm:openai@4.36.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-auth"
};

// Initialize OpenAI with environment variables
const openai = new OpenAI({
  apiKey: Deno.env.get("VITE_OPENAI_API_KEY")
});

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase environment variables" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Parse the request
    let requestData;
    try {
      requestData = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { variationId } = requestData;
    
    if (!variationId) {
      return new Response(
        JSON.stringify({ error: "Variation ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Fetch the variation and job
    const { data: variation, error: variationError } = await supabase
      .from('prompt_variations')
      .select(`
        id, 
        prompt, 
        session_id, 
        automation_sessions!inner(
          product_image_url, 
          brand_logo_url, 
          reference_ad_url
        )
      `)
      .eq('id', variationId)
      .single();
    
    if (variationError) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch variation: ${variationError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Find the job
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .select('*')
      .eq('variation_id', variationId)
      .single();
    
    if (jobError) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch job: ${jobError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Update job status to in_progress
    const { error: updateJobError } = await supabase
      .from('generation_jobs')
      .update({ 
        status: 'in_progress',
        updated_at: new Date().toISOString() 
      })
      .eq('id', job.id);
      
    if (updateJobError) {
      console.error("Failed to update job status:", updateJobError);
    }
    
    // Update variation status
    const { error: updateVariationError } = await supabase
      .from('prompt_variations')
      .update({ 
        status: 'in_progress',
        updated_at: new Date().toISOString() 
      })
      .eq('id', variationId);
      
    if (updateVariationError) {
      console.error("Failed to update variation status:", updateVariationError);
    }
    
    // Begin gathering reference images
    const session = variation.automation_sessions;
    const referenceUrls = [];
    
    // Add product image
    if (session.product_image_url) {
      referenceUrls.push(session.product_image_url);
    }
    
    // Add brand logo if provided
    if (session.brand_logo_url) {
      referenceUrls.push(session.brand_logo_url);
    }
    
    // Add reference ad if provided
    if (session.reference_ad_url) {
      referenceUrls.push(session.reference_ad_url);
    }
    
    // Download reference images
    const imageBlobs = [];
    for (const url of referenceUrls) {
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
        console.error(`Error downloading reference image ${url}:`, error);
      }
    }
    
    // Convert to file objects
    const imageFiles = imageBlobs.map((blob, index) => {
      return new File([blob], `reference_${index}.png`, { type: "image/png" });
    });
    
    try {
      // Call OpenAI to generate image
      let result;
      
      // If we have reference images, use edit endpoint
      if (imageFiles.length > 0) {
        result = await openai.images.edit({
          model: "gpt-image-1",
          prompt: variation.prompt,
          image: imageFiles,
          quality: "high",
          size: "1024x1024"
        });
      } 
      // Otherwise use text-to-image endpoint
      else {
        result = await openai.images.generate({
          model: "gpt-image-1",
          prompt: variation.prompt,
          quality: "high",
          size: "1024x1024"
        });
      }
      
      // Get the base64 image from the response
      const generatedImageBase64 = result.data[0].b64_json;
      if (!generatedImageBase64) {
        throw new Error("No image data returned from OpenAI");
      }
      
      // Convert base64 to binary data
      const binaryData = Uint8Array.from(atob(generatedImageBase64), char => char.charCodeAt(0));
      
      // Create a unique path for the image
      const { data: sessionData } = await supabase.auth.getSession();
      let userId = sessionData?.session?.user?.id;
      
      if (!userId) {
        // Try to get the user ID from the automation session
        const { data: sessionInfo } = await supabase
          .from('automation_sessions')
          .select('user_id')
          .eq('id', variation.session_id)
          .single();
          
        if (!sessionInfo?.user_id) {
          throw new Error("Failed to determine user ID");
        }
        
        userId = sessionInfo.user_id;
      }
      
      const imagePath = `${userId}/automated/${variation.session_id}/${variation.id}.png`;
      
      // Make sure the bucket exists
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(bucket => bucket.name === "automated");
        
        if (!bucketExists) {
          await supabase.storage.createBucket("automated", {
            public: true
          });
        }
      } catch (error) {
        console.error(`Error checking/creating bucket:`, error);
      }
      
      // Upload to storage - FIXED: don't use .buffer on Uint8Array
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("automated")
        .upload(imagePath, binaryData, {
          contentType: "image/png",
          upsert: true
        });
        
      if (uploadError) {
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from("automated")
        .getPublicUrl(imagePath);
        
      const imageUrl = urlData.publicUrl;
      
      // Update the job with the result
      await supabase
        .from('generation_jobs')
        .update({
          status: 'completed',
          image_url: imageUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);
        
      // Update the variation status
      await supabase
        .from('prompt_variations')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', variationId);
      
      // Check if this was the last job for this session
      const { data: remainingJobs, error: countError } = await supabase
        .from('generation_jobs')
        .select('id', { count: 'exact' })
        .eq('status', 'queued')
        .in('variation_id', supabase.from('prompt_variations')
          .select('id')
          .eq('session_id', variation.session_id));
      
      if (!countError) {
        // If there are more jobs, start the next one
        if (remainingJobs && remainingJobs.length > 0) {
          // Find the next job
          const { data: nextVariation } = await supabase
            .from('prompt_variations')
            .select('id')
            .eq('session_id', variation.session_id)
            .eq('status', 'ready')
            .order('index')
            .limit(1);
            
          if (nextVariation && nextVariation.length > 0) {
            // Process the next job
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
          }
        } else {
          // All jobs are complete, update the session status
          await supabase
            .from('automation_sessions')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', variation.session_id);
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          imageUrl 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
      
    } catch (imageError) {
      console.error("Error generating image:", imageError);
      
      // Update job status to failed
      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: imageError.message || "Unknown error",
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);
        
      // Update variation status
      await supabase
        .from('prompt_variations')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', variationId);
      
      return new Response(
        JSON.stringify({ 
          error: `Image generation failed: ${imageError.message}` 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

  } catch (error) {
    console.error("Error in process-generation-job:", error);

    return new Response(
      JSON.stringify({
        status: "error",
        message: error.message || "An unexpected error occurred",
        error: String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});