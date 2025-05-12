import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { v4 as uuidv4 } from "npm:uuid@9.0.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the request
    const { 
      prompt, 
      reference_image_urls, 
      number_of_variants = 1, 
      user_id 
    } = await req.json();

    // Validate inputs
    if (!prompt || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: prompt and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cap number of variants to prevent abuse (max 5)
    const variants = Math.min(Math.max(number_of_variants, 1), 5);

    console.log(`Generating ${variants} variants for user ${user_id}`);
    console.log(`Prompt: ${prompt}`);
    console.log(`Reference images: ${reference_image_urls?.length || 0}`);

    // Check if user has enough credits
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("credits")
      .eq("user_id", user_id)
      .single();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: `Failed to get user profile: ${profileError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userCredits = userProfile.credits || 0;

    if (userCredits < variants) {
      return new Response(
        JSON.stringify({ 
          error: "Insufficient credits", 
          message: `You need ${variants} credits but only have ${userCredits} available.`,
          credits: userCredits
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a batch ID to group these generation tasks
    const batchId = uuidv4();

    // Create a generation task for each variant
    const generationTasks = Array.from({ length: variants }).map((_, index) => ({
      user_id,
      prompt,
      reference_image_urls: reference_image_urls || [],
      status: "pending",
      batch_id: batchId,
      total_in_batch: variants,
      batch_index: index
    }));

    // Insert all tasks into the database
    const { data: tasksData, error: tasksError } = await supabase
      .from("generation_tasks")
      .insert(generationTasks)
      .select();

    if (tasksError) {
      return new Response(
        JSON.stringify({ error: `Failed to create generation tasks: ${tasksError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct credits upfront
    await supabase.rpc("deduct_multiple_credits", { 
      user_id_param: user_id, 
      amount: variants 
    });

    // Kick off the generation of the first task
    // We'll use an Edge Function to handle the processing asynchronously
    try {
      // Get the first task
      const firstTask = tasksData[0];
      
      // Call the process-task edge function to start processing the first task
      await fetch(`${supabaseUrl}/functions/v1/process-generation-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ 
          taskId: firstTask.id,
          batchId
        })
      });
      
      console.log(`Started processing task ${firstTask.id} from batch ${batchId}`);
    } catch (processingError) {
      console.error("Error starting task processing:", processingError);
      // We still return success as the tasks are created, processing will continue in background
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: `Started generating ${variants} image variants`,
        batch_id: batchId,
        tasks: tasksData.map(task => ({
          id: task.id,
          status: task.status,
          batch_index: task.batch_index
        })),
        credits_remaining: userCredits - variants
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Error in generate-image-variants:", error);

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