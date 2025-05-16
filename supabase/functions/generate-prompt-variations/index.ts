import OpenAI from "npm:openai@4.98.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// Initialize OpenAI with environment variables
const openai = new OpenAI({
  apiKey: Deno.env.get("VITE_OPENAI_API_KEY")
});

// Define schema for prompt generation response
const promptsSchema = z.object({
  prompts: z.array(z.string().min(10)).min(1).max(10),
});

/**
 * Downloads an image from a URL and returns it as a Blob
 * This function handles both external URLs and Supabase storage URLs
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
        throw new Error(`Failed to download reference image: ${error.message}`);
      }
      
      if (!data) {
        throw new Error('No file data returned from storage');
      }
      
      console.log(`Downloaded image from Supabase storage`);
      return data;
    }
  } catch (error) {
    console.error(`ERROR downloading image from ${url}:`, error);
    return null;
  }
}

/**
 * Prepares images for OpenAI by downloading them and converting to base64
 */
async function prepareImagesForOpenAI(imageUrls: string[], supabase: any, supabaseUrl: string): Promise<string[]> {
  console.log(`Preparing ${imageUrls.length} images for OpenAI`);
  
  const imageBlobs: Array<Blob | null> = await Promise.all(
    imageUrls.map(url => downloadImageFromUrl(url, supabase, supabaseUrl))
  );
  
  // Filter out null blobs and convert to base64
  const base64Images = await Promise.all(
    imageBlobs
      .filter((blob): blob is Blob => blob !== null)
      .map(async (blob) => {
        return await blobToBase64(blob);
      })
  );
  
  console.log(`Successfully prepared ${base64Images.length}/${imageUrls.length} images`);
  return base64Images;
}

/**
 * Converts a Blob to a base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      } else {
        reject(new Error("Failed to convert blob to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

Deno.serve(async (req: Request) => {
  // Handle CORS
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

    // Parse the request
    const { sessionId } = await req.json();
    
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Session ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the session
    const { data: session, error: sessionError } = await supabase
      .from('automation_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (sessionError) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch session: ${sessionError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Verify user owns the session
    if (session.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to access this session" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update session status to indicate we're generating prompts
    await supabase
      .from('automation_sessions')
      .update({ status: 'generating_prompts', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    // Clear any existing prompt variations for this session
    await supabase
      .from('prompt_variations')
      .delete()
      .eq('session_id', sessionId);

    // Collect image URLs from the session
    const imageUrls: string[] = [];
    if (session.product_image_url) {
      imageUrls.push(session.product_image_url);
    }
    if (session.brand_logo_url) {
      imageUrls.push(session.brand_logo_url);
    }
    if (session.reference_ad_url) {
      imageUrls.push(session.reference_ad_url);
    }
    
    // Download and prepare the images
    const imageContent = await prepareImagesForOpenAI(imageUrls, supabase, supabaseUrl);

    // Construct the ChatGPT message
    const systemMessage = `You are an expert ecommerce ad copywriter and marketing specialist. You create compelling, professional, and detailed prompts for AI image generators to create product advertisements. Each prompt should be detailed and specific, focusing on high-quality product photography, professional marketing aesthetics, and commercial appeal.`;

    const userMessageContent = `Create ${session.variation_count} different, 
detailed prompts for generating product advertisements with these specifications:

Product Image: ${session.product_image_url}
${session.brand_logo_url ? `Brand Logo: ${session.brand_logo_url}` : ''}
${session.reference_ad_url ? `Reference Ad Style: ${session.reference_ad_url}` : ''}
${session.instructions ? `Additional Instructions: ${session.instructions}` : ''}

Use the product and reference ad attached image thoroughly to come up with a prompt. The goal is to create variations of a successful ad attached as reference.

Each prompt should:
1. Detail a unique ad concept and style
2. Specify how the product should be presented
3. Describe lighting, background, and overall composition
4. Include marketing-oriented details like suggested text positioning or themes

Your output MUST follow the specified JSON format with a "prompts" array containing strings.`;

    // Call GPT-4o with structured outputs
    console.log("Calling OpenAI API with model: gpt-4o-2024-11-20 and structured outputs");
    let chatResponse;
    
    // Different API call depending on whether we have images or not
    if (imageContent.length > 0) {
      console.log("Including images in OpenAI request");
      
      // Create message array with image content
      const messages = [
        { role: "system", content: systemMessage },
        { 
          role: "user", 
          content: [
            { type: "text", text: userMessageContent },
            ...imageContent.map(base64Image => ({
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }))
          ] 
        }
      ];
      
      chatResponse = await openai.chat.completions.create({
        model: "gpt-4o-2024-11-20", // Updated to latest model
        messages: messages,
        response_format: { type: "json_object", schema: promptsSchema.shape },
        top_p: 0.7, // Lower value for more focused outputs
        temperature: 0.9  // Maintain creativity
      });
    } else {
      console.log("No images available, using text-only OpenAI request");
      chatResponse = await openai.chat.completions.create({
        model: "gpt-4o-2024-11-20", // Updated to latest model
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessageContent }
        ],
        response_format: { type: "json_object", schema: promptsSchema.shape },
        top_p: 0.7, // Lower value for more focused outputs
        temperature: 0.9  // Maintain creativity
      });
    }
    
    console.log("OpenAI response received");

    // Extract the response content
    const responseContent = chatResponse.choices[0].message.content;
    console.log(`Response content length: ${responseContent.length}`);
    
    // Save the raw response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseContent);
      console.log("Successfully parsed JSON response");
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      console.log("Raw response:", responseContent);
      throw new Error(`Failed to parse OpenAI response as JSON: ${parseError.message}`);
    }
    
    // Validate with Zod schema
    try {
      const validatedResponse = promptsSchema.parse(parsedResponse);
      console.log(`Validated response with ${validatedResponse.prompts.length} prompts`);
    } catch (validationError) {
      console.error("Schema validation error:", validationError);
      throw new Error(`Response did not match expected schema: ${validationError.message}`);
    }
    
    const { data: responseRecord, error: responseError } = await supabase
      .from('prompt_generation_responses')
      .insert({
        session_id: sessionId,
        raw_response: parsedResponse
      })
      .select()
      .single();
    
    if (responseError) {
      console.error("Failed to save response:", responseError);
      console.log("Raw response content:", responseContent);
      return new Response(
        JSON.stringify({ error: `Failed to save response: ${responseError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response
    try {
      const promptsArray = parsedResponse.prompts;
      
      if (!promptsArray || !Array.isArray(promptsArray)) {
        throw new Error(`Expected an array of prompts, got: ${JSON.stringify(parsedResponse)}`);
      }
      
      console.log(`Successfully extracted ${promptsArray.length} prompts from response`);
      
      // Insert the prompt variations
      const promptInserts = promptsArray.map((prompt, index) => ({
        session_id: sessionId,
        prompt,
        index,
        status: 'ready'
      }));
      
      if (promptInserts.length > 0) {
        const { error: insertsError } = await supabase
          .from('prompt_variations')
          .insert(promptInserts);
        
        if (insertsError) {
          throw new Error(`Failed to insert prompt variations: ${insertsError.message}`);
        }
        
        console.log(`Successfully inserted ${promptInserts.length} prompt variations`);
      }
      
      // Create generation jobs for each prompt variation
      const { data: variations, error: variationsError } = await supabase
        .from('prompt_variations')
        .select('id, prompt')
        .eq('session_id', sessionId)
        .eq('status', 'ready');
      
      if (variationsError) {
        throw new Error(`Failed to fetch variations: ${variationsError.message}`);
      }
      
      const jobInserts = variations.map(variation => ({
        variation_id: variation.id,
        prompt: variation.prompt,
        status: 'queued'
      }));
      
      if (jobInserts.length > 0) {
        const { error: jobsError } = await supabase
          .from('generation_jobs')
          .insert(jobInserts);
        
        if (jobsError) {
          throw new Error(`Failed to insert generation jobs: ${jobsError.message}`);
        }
        
        console.log(`Successfully inserted ${jobInserts.length} generation jobs`);
      }
      
      // Update session status
      await supabase
        .from('automation_sessions')
        .update({ 
          status: 'prompts_generated', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', sessionId);
      
      // Start the first job processing
      try {
        if (variations.length > 0) {
          // Process the first job
          await fetch(`${supabaseUrl}/functions/v1/process-generation-job`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ 
              variationId: variations[0].id
            })
          });
          
          console.log(`Started processing first job for variation: ${variations[0].id}`);
        }
      } catch (processError) {
        console.error("Error starting job processing:", processError);
        // We'll continue anyway and let the scheduler pick it up
      }
      
      // Return success
      return new Response(
        JSON.stringify({ 
          success: true, 
          promptCount: promptsArray.length,
          prompts: promptsArray
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
      
    } catch (parseError) {
      // Update session status to failed
      await supabase
        .from('automation_sessions')
        .update({ 
          status: 'failed', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', sessionId);
      
      return new Response(
        JSON.stringify({ 
          error: `Failed to parse prompts: ${parseError.message}`,
          rawResponse: responseContent
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error in generate-prompt-variations:", error);

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