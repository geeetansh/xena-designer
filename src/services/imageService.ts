import { supabase } from '@/lib/supabase';

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  created_at: string;
  reference_images?: any[];
  raw_json?: string;
  variation_group_id?: string;
  variation_index?: number;
}

// Modified function to accept an AbortSignal parameter
export async function fetchGeneratedImages(
  limit = 10, 
  page = 1,
  signal?: AbortSignal
): Promise<{ 
  images: GeneratedImage[]; 
  totalCount: number;
  hasMore: boolean;
}> {
  try {
    const offset = (page - 1) * limit;
    
    // Count query to get total records
    const { count, error: countError } = await supabase
      .from('images')
      .select('id', { count: 'exact', head: true })
      .abortSignal(signal);
    
    if (countError) throw countError;
    
    // Fetch the images with pagination
    const { data, error } = await supabase
      .from('images')
      .select(`
        id, 
        url, 
        prompt, 
        created_at,
        raw_json,
        variation_group_id,
        variation_index,
        reference_images:images!variation_group_id(id, url)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
      .abortSignal(signal);
    
    if (error) throw error;
    
    // Calculate if there are more results
    const totalCount = count || 0;
    const hasMore = offset + limit < totalCount;
    
    return {
      images: data || [],
      totalCount,
      hasMore
    };
  } catch (error) {
    console.error('Error fetching images:', error);
    throw error;
  }
}

export async function deleteGeneratedImage(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('images')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
}

export async function fetchImageById(id: string): Promise<GeneratedImage> {
  try {
    const { data, error } = await supabase
      .from('images')
      .select(`
        id, 
        url, 
        prompt, 
        created_at,
        raw_json,
        variation_group_id,
        variation_index,
        reference_images:images!variation_group_id(id, url)
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Error fetching image by ID:', error);
    throw error;
  }
}