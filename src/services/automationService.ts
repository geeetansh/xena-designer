import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/posthog';
import { uploadImageFile } from './imageService';

export interface AutomationSession {
  id: string;
  user_id: string;
  product_image_url: string;
  brand_logo_url?: string;
  reference_ad_url?: string;
  instructions?: string;
  variation_count: number;
  status: string;
  created_at: string;
  updated_at: string;
  layout?: string;
}

export interface PromptVariation {
  id: string;
  session_id: string;
  prompt: string;
  index: number;
  status: string;
}

export interface GenerationJob {
  id: string;
  variation_id: string;
  prompt: string;
  image_url?: string;
  status: string;
  error_message?: string;
}

/**
 * Prepares images for automation by uploading them to Supabase storage
 * @param productImage The product image file (required)
 * @param brandLogo The brand logo file (optional)
 * @param referenceAd The reference ad file (optional)
 * @returns Object with URLs for the uploaded images
 */
export async function prepareAutomationImages(
  productImage: File,
  brandLogo?: File | null,
  referenceAd?: File | null
): Promise<{
  productImageUrl: string;
  brandLogoUrl?: string;
  referenceAdUrl?: string;
}> {
  // Create an array of all files to upload
  const filesToUpload: Array<{file: File, type: 'product' | 'logo' | 'reference'}> = [];
  
  if (productImage) {
    filesToUpload.push({ file: productImage, type: 'product' });
  }
  
  if (brandLogo) {
    filesToUpload.push({ file: brandLogo, type: 'logo' });
  }
  
  if (referenceAd) {
    filesToUpload.push({ file: referenceAd, type: 'reference' });
  }
  
  // Upload all files in parallel
  const uploadPromises = filesToUpload.map(({ file, type }) => 
    uploadImageFile(file).then(url => ({ url, type }))
  );
  
  const uploadResults = await Promise.all(uploadPromises);
  
  // Extract URLs by type
  const result: {
    productImageUrl: string;
    brandLogoUrl?: string;
    referenceAdUrl?: string;
  } = {
    productImageUrl: '',
  };
  
  uploadResults.forEach(({ url, type }) => {
    if (type === 'product') {
      result.productImageUrl = url;
    } else if (type === 'logo') {
      result.brandLogoUrl = url;
    } else if (type === 'reference') {
      result.referenceAdUrl = url;
    }
  });
  
  return result;
}

/**
 * Check if user has enough credits for the requested number of variations
 * @param variationCount Number of variations to generate
 * @returns Object with hasCredits and credits information
 */
export async function checkUserCreditsForAutomation(variationCount: number): Promise<{
  hasCredits: boolean;
  credits: number;
}> {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Check user's credits
    const { data, error } = await supabase
      .from('user_profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      console.error('Error checking user credits:', error);
      throw new Error('Failed to check credit balance');
    }
    
    const credits = data?.credits || 0;
    
    console.log(`User has ${credits} credits, needs ${variationCount} for automation`);
    
    return {
      hasCredits: credits >= variationCount,
      credits
    };
  } catch (error) {
    console.error('Error checking user credits:', error);
    throw error;
  }
}

export async function createAutomationSession(
  productImage: File,
  brandLogo?: File | null,
  referenceAd?: File | null,
  instructions?: string,
  variationCount: number = 3,
  layout: string = 'auto'
): Promise<string> {
  try {
    // First check if user has enough credits
    const { hasCredits, credits } = await checkUserCreditsForAutomation(variationCount);
    
    if (!hasCredits) {
      throw new Error(`You need ${variationCount} credits for this generation but only have ${credits} available.`);
    }

    // Upload all images first using the prepareAutomationImages function
    const {
      productImageUrl,
      brandLogoUrl,
      referenceAdUrl
    } = await prepareAutomationImages(productImage, brandLogo, referenceAd);
    
    // Ensure we have a product image URL
    if (!productImageUrl) {
      throw new Error('Failed to upload product image');
    }
    
    // Get the current session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('You must be logged in to create an automation session');
    }
    
    // Deduct credits first
    const { error: deductError } = await supabase.rpc("deduct_multiple_credits", { 
      user_id_param: session.user.id, 
      amount: variationCount 
    });
    
    if (deductError) {
      console.error('Error deducting credits:', deductError);
      throw new Error(`Failed to deduct credits: ${deductError.message}`);
    }
    
    // Now call the edge function to create a session
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-automation-session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productImageUrl,
        brandLogoUrl: brandLogoUrl || null,
        referenceAdUrl: referenceAdUrl || null,
        instructions: instructions || null,
        variationCount,
        layout
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create automation session');
    }
    
    const { session: createdSession } = await response.json();
    
    // Track the event
    trackEvent('automation_session_created', {
      session_id: createdSession.id,
      variation_count: variationCount,
      layout,
      has_brand_logo: !!brandLogoUrl,
      has_reference_ad: !!referenceAdUrl,
      has_instructions: !!instructions,
      credits_used: variationCount
    });
    
    return createdSession.id;
  } catch (error) {
    console.error('Error creating automation session:', error);
    throw error;
  }
}

export async function generatePrompts(sessionId: string): Promise<void> {
  try {
    // Get the current session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('You must be logged in to generate prompts');
    }
    
    // Call the edge function to generate prompts
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-prompt-variations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate prompts');
    }
    
    // Track the event
    trackEvent('automation_prompts_generated', {
      session_id: sessionId
    });
  } catch (error) {
    console.error('Error generating prompts:', error);
    throw error;
  }
}

export async function fetchAutomationSession(sessionId: string): Promise<AutomationSession | null> {
  try {
    const { data, error } = await supabase
      .from('automation_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
      
    if (error) {
      console.error('Error fetching automation session:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching automation session:', error);
    return null;
  }
}

export async function fetchPromptVariations(sessionId: string): Promise<PromptVariation[]> {
  try {
    const { data, error } = await supabase
      .from('prompt_variations')
      .select('*')
      .eq('session_id', sessionId)
      .order('index');
      
    if (error) {
      console.error('Error fetching prompt variations:', error);
      return [];
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching prompt variations:', error);
    return [];
  }
}

export async function fetchGenerationJobs(sessionId: string): Promise<GenerationJob[]> {
  try {
    // First get all variation IDs for this session
    const { data: variations, error: varError } = await supabase
      .from('prompt_variations')
      .select('id')
      .eq('session_id', sessionId);
      
    if (varError || !variations || variations.length === 0) {
      console.error('Error fetching variation IDs:', varError);
      return [];
    }
    
    // Then get all jobs for these variation IDs
    const { data, error } = await supabase
      .from('generation_jobs')
      .select('*')
      .in('variation_id', variations.map(v => v.id));
      
    if (error) {
      console.error('Error fetching generation jobs:', error);
      return [];
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching generation jobs:', error);
    return [];
  }
}