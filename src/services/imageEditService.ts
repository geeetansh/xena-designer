import { supabase } from '@/lib/supabase';
import { usePostHog } from '@/lib/posthog';
import { log, error as logError, success } from '@/lib/logger';

/**
 * Interface for edited image record
 */
export interface EditedImage {
  id: string;
  original_image_id: string;
  user_id: string;
  prompt: string;
  image_url: string | null;
  status: 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Check if magic edit feature is enabled for current user
 */
export function isMagicEditEnabled(): boolean {
  const { posthog } = usePostHog();
  return posthog.isFeatureEnabled('magic-editing') || false;
}

/**
 * Start an edit operation for an image
 * 
 * @param originalImageId The ID of the original image job
 * @param originalImageUrl The URL of the original image
 * @param editPrompt The editing instructions
 */
export async function startImageEdit(
  originalImageId: string,
  originalImageUrl: string,
  editPrompt: string
): Promise<string> {
  try {
    log(`Starting image edit for original image: ${originalImageId}`);
    
    // Ensure the user is logged in
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('You must be logged in to edit images');
    }

    // Create a new edited_images record
    const { data: editRecord, error } = await supabase
      .from('edited_images')
      .insert({
        original_image_id: originalImageId,
        user_id: user.id,
        prompt: editPrompt,
        status: 'processing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (error) {
      logError(`Failed to create edit record: ${error.message}`);
      throw new Error(`Failed to start image edit: ${error.message}`);
    }
    
    if (!editRecord) {
      throw new Error('Failed to create edit record');
    }
    
    // Call the edge function to process the edit
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('No active session');
    }
    
    // Send the edit request to the edge function
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        editId: editRecord.id,
        originalImageUrl,
        editPrompt
      })
    }).catch((fetchError) => {
      console.error('Error calling edit-image function:', fetchError);
      // Don't await this, let it run in the background
    });
    
    success(`Image edit started with ID: ${editRecord.id}`);
    return editRecord.id;
  } catch (error) {
    logError(`Error starting image edit: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Get all edits for a specific original image
 * 
 * @param originalImageId The ID of the original image
 */
export async function getImageEdits(originalImageId: string): Promise<EditedImage[]> {
  try {
    const { data, error } = await supabase
      .from('edited_images')
      .select('*')
      .eq('original_image_id', originalImageId)
      .order('created_at', { ascending: false });
    
    if (error) {
      logError(`Failed to fetch image edits: ${error.message}`);
      throw new Error(`Failed to fetch image edits: ${error.message}`);
    }
    
    return data || [];
  } catch (error) {
    logError(`Error getting image edits: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Check the status of an edit operation
 * 
 * @param editId The ID of the edit operation
 */
export async function getEditStatus(editId: string): Promise<EditedImage | null> {
  try {
    const { data, error } = await supabase
      .from('edited_images')
      .select('*')
      .eq('id', editId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logError(`Failed to fetch edit status: ${error.message}`);
      throw new Error(`Failed to fetch edit status: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    logError(`Error getting edit status: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Delete an edited image
 * 
 * @param editId The ID of the edit to delete
 */
export async function deleteEditedImage(editId: string): Promise<void> {
  try {
    // Get the edited image first to get the URL
    const { data: editedImage, error: fetchError } = await supabase
      .from('edited_images')
      .select('image_url')
      .eq('id', editId)
      .single();
    
    if (fetchError) {
      logError(`Failed to fetch edited image: ${fetchError.message}`);
      throw new Error(`Failed to fetch edited image: ${fetchError.message}`);
    }
    
    // Delete the image from storage if it exists
    if (editedImage?.image_url) {
      try {
        const url = new URL(editedImage.image_url);
        const path = url.pathname;
        // Extract bucket and file path
        const parts = path.split('/');
        const bucketIndex = parts.indexOf('public') + 1;
        if (bucketIndex > 0) {
          const bucket = parts[bucketIndex];
          const filePath = parts.slice(bucketIndex + 1).join('/');
          
          await supabase.storage
            .from(bucket)
            .remove([filePath]);
        }
      } catch (storageError) {
        console.error('Error deleting file from storage:', storageError);
        // Continue with deletion even if storage delete fails
      }
    }
    
    // Now delete the record
    const { error: deleteError } = await supabase
      .from('edited_images')
      .delete()
      .eq('id', editId);
    
    if (deleteError) {
      logError(`Failed to delete edited image: ${deleteError.message}`);
      throw new Error(`Failed to delete edited image: ${deleteError.message}`);
    }
    
    success(`Edited image ${editId} deleted successfully`);
  } catch (error) {
    logError(`Error deleting edited image: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}