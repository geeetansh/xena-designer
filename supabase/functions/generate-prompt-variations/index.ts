import OpenAI from "npm:openai@4.98.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// Initialize OpenAI with environment variables
const openai = new OpenAI({
  apiKey: Deno.env.get("VITE_OPENAI_API_KEY")
});

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

    // Construct the ChatGPT message
    const systemMessage = `You are an expert ecommerce ad copywriter and marketing specialist. You create compelling, professional, 
and detailed prompts for AI image generators to create product advertisements. Each prompt should be detailed and specific, 
focusing on high-quality product photography, professional marketing aesthetics, and commercial appeal.`;

    const userMessageContent = `Create ${session.variation_count} different, 
detailed prompts for generating product advertisements with these specifications:

Product Image: ${session.product_image_url}
${session.brand_logo_url ? `Brand Logo: ${session.brand_logo_url}` : ''}
${session.reference_ad_url ? `Reference Ad Style: ${session.reference_ad_url}` : ''}
${session.instructions ? `Additional Instructions: ${session.instructions}` : ''}

Each prompt should:
1. Detail a unique ad concept and style
2. Specify how the product should be presented
3. Describe lighting, background, and overall composition
4. Include marketing-oriented details like suggested text positioning or themes
5. Be at least 100 words to provide sufficient detail for high-quality generation

Format your response as a valid JSON with a "prompts" field containing an array of strings, each string being a complete prompt. Example:
\`\`\`json
{
  "prompts": [
    "Create a professional product advertisement for...",
    "Design a lifestyle marketing image featuring...",
    "Generate a minimalist product showcase with..."
  ]
}
\`\`\``;

    // Call ChatGPT to generate prompts
    console.log("Calling OpenAI API with model: o4-mini");
    const chatResponse = await openai.chat.completions.create({
      model: "o4-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessageContent }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      strict: true
    });
    
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