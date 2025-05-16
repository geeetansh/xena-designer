import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { v4 as uuidv4 } from "npm:uuid@9.0.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
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

    // Parse the request
    const { 
      productImageUrl,
      brandLogoUrl,
      referenceAdUrl,
      instructions,
      variationCount,
      layout = 'auto' // Default to 'auto' if not provided
    } = await req.json();
    
    // Validate the required fields
    if (!productImageUrl) {
      return new Response(
        JSON.stringify({ error: "Product image URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a new session
    const { data: session, error: createError } = await supabase
      .from('automation_sessions')
      .insert({
        user_id: userId,
        product_image_url: productImageUrl,
        brand_logo_url: brandLogoUrl,
        reference_ad_url: referenceAdUrl,
        instructions: instructions || null,
        variation_count: variationCount || 3,
        status: 'draft',
        layout: layout // Store the layout in the database
      })
      .select()
      .single();
    
    if (createError) {
      return new Response(
        JSON.stringify({ error: `Failed to create session: ${createError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Return the session ID
    return new Response(
      JSON.stringify({ 
        success: true,
        session: {
          id: session.id,
          status: session.status
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Error in create-automation-session:", error);

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