import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  const functionStart = Date.now();
  console.log(`[${new Date().toISOString()}] Monitor-batch-tasks function triggered`);
  
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request data or use defaults
    let batchId = "";
    let checkAll = false;
    const timeoutMinutes = 15; // Default timeout of 15 minutes
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        batchId = body.batch_id || "";
        checkAll = body.check_all || false;
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Error parsing request body:`, e);
        // Continue with defaults
      }
    }
    
    // Calculate cutoff time for stalled tasks (default: 15 minutes ago)
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - timeoutMinutes);
    const cutoffTimeString = cutoffTime.toISOString();
    
    console.log(`[${new Date().toISOString()}] Checking for stalled tasks, cutoff time: ${cutoffTimeString}`);

    // Define the query based on parameters
    let query = supabase
      .from("generation_tasks")
      .select("id, batch_id, batch_index, status, created_at, updated_at");
    
    if (batchId) {
      console.log(`[${new Date().toISOString()}] Checking specific batch: ${batchId}`);
      query = query.eq("batch_id", batchId);
    } else {
      // Check for 'processing' or 'pending' tasks that have been stuck for too long
      query = query.or(`status.eq.processing,status.eq.pending`);
      query = query.lt("updated_at", cutoffTimeString);
    }

    // Execute the query
    const { data: stalledTasks, error } = await query;

    if (error) {
      console.error(`[${new Date().toISOString()}] Error fetching stalled tasks:`, error);
      throw new Error(`Failed to fetch tasks: ${error.message}`);
    }

    console.log(`[${new Date().toISOString()}] Found ${stalledTasks?.length || 0} potentially stalled tasks`);

    // Process each potentially stalled task
    const results = {
      tasks_checked: stalledTasks?.length || 0,
      tasks_restarted: 0,
      tasks_failed: 0,
      processing_time: 0,
      details: []
    };

    if (stalledTasks && stalledTasks.length > 0) {
      for (const task of stalledTasks) {
        const taskStart = Date.now();
        console.log(`[${new Date().toISOString()}] Checking task ${task.id} (status: ${task.status})`);
        
        // For tasks that are stuck in 'processing' state for too long
        if (task.status === "processing") {
          // Calculate how long the task has been processing
          const updatedAt = new Date(task.updated_at);
          const processingTime = (Date.now() - updatedAt.getTime()) / 1000 / 60; // in minutes
          
          console.log(`[${new Date().toISOString()}] Task ${task.id} has been processing for ${processingTime.toFixed(1)} minutes`);
          
          // If processing for more than the timeout period, mark as failed
          if (processingTime > timeoutMinutes) {
            console.log(`[${new Date().toISOString()}] Task ${task.id} timed out, marking as failed`);
            
            try {
              await supabase
                .from("generation_tasks")
                .update({
                  status: "failed",
                  error_message: `Task timed out after ${processingTime.toFixed(1)} minutes of processing`,
                  updated_at: new Date().toISOString()
                })
                .eq("id", task.id);
              
              // Also update corresponding photoshoot if it exists
              try {
                await supabase
                  .from("photoshoots")
                  .update({
                    status: "failed",
                    error_message: `Image generation timed out after ${processingTime.toFixed(1)} minutes`,
                    updated_at: new Date().toISOString()
                  })
                  .eq("batch_id", task.batch_id)
                  .eq("batch_index", task.batch_index);
                
                console.log(`[${new Date().toISOString()}] Updated corresponding photoshoot for batch ${task.batch_id}, index ${task.batch_index}`);
              } catch (photoshootError) {
                console.error(`[${new Date().toISOString()}] Error updating photoshoot:`, photoshootError);
              }

              results.tasks_failed++;
              results.details.push({
                task_id: task.id,
                batch_id: task.batch_id,
                batch_index: task.batch_index,
                action: "marked_as_failed",
                reason: `Timed out after ${processingTime.toFixed(1)} minutes`,
                processing_time: `${processingTime.toFixed(1)} minutes`
              });
            } catch (updateError) {
              console.error(`[${new Date().toISOString()}] Error updating stalled task:`, updateError);
              results.details.push({
                task_id: task.id,
                action: "update_failed",
                error: updateError.message
              });
            }
          }
        } 
        // For tasks stuck in 'pending' state
        else if (task.status === "pending") {
          // Calculate how long the task has been pending
          const updatedAt = new Date(task.updated_at);
          const pendingTime = (Date.now() - updatedAt.getTime()) / 1000 / 60; // in minutes
          
          console.log(`[${new Date().toISOString()}] Task ${task.id} has been pending for ${pendingTime.toFixed(1)} minutes`);
          
          // Restart processing for stuck pending tasks
          if (pendingTime > timeoutMinutes) {
            console.log(`[${new Date().toISOString()}] Task ${task.id} stuck in pending state, restarting processing`);
            
            try {
              // Call the process-generation-task function to restart processing
              await fetch(`${supabaseUrl}/functions/v1/process-generation-task`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseKey}`
                },
                body: JSON.stringify({ 
                  taskId: task.id,
                  batchId: task.batch_id
                })
              });
              
              results.tasks_restarted++;
              results.details.push({
                task_id: task.id,
                batch_id: task.batch_id,
                batch_index: task.batch_index,
                action: "restarted",
                reason: `Stuck in pending state for ${pendingTime.toFixed(1)} minutes`
              });
            } catch (fetchError) {
              console.error(`[${new Date().toISOString()}] Error restarting task:`, fetchError);
              results.details.push({
                task_id: task.id,
                action: "restart_failed",
                error: fetchError.message
              });
            }
          }
        }
        
        const taskDuration = (Date.now() - taskStart) / 1000;
        console.log(`[${new Date().toISOString()}] Processed task ${task.id} in ${taskDuration.toFixed(2)}s`);
      }
    }
    
    results.processing_time = (Date.now() - functionStart) / 1000;
    console.log(`[${new Date().toISOString()}] Task monitoring completed in ${results.processing_time.toFixed(2)}s`);

    return new Response(
      JSON.stringify({
        status: "success",
        message: `Checked ${results.tasks_checked} tasks, restarted ${results.tasks_restarted}, marked ${results.tasks_failed} as failed`,
        results
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      }
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in monitor-batch-tasks:`, error);
    
    return new Response(
      JSON.stringify({
        status: "error",
        message: error.message || "An unexpected error occurred",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        processing_time: (Date.now() - functionStart) / 1000
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      }
    );
  }
});