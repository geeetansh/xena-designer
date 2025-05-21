import { supabase } from '@/lib/supabase';
import { isFeatureEnabled } from '@/lib/posthog';

// Define interfaces for prompt template data
export interface PromptTemplateProperties {
  temperature: number;
  max_tokens: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
}

export interface PromptTemplate {
  id?: string;
  base_prompt_text: string;
  custom_properties: PromptTemplateProperties;
  user_id?: string;
  last_modified_timestamp?: string;
  created_at?: string;
}

// Default values for prompt template properties
export const defaultPromptTemplateProperties: PromptTemplateProperties = {
  temperature: 0.9,
  max_tokens: 150,
  top_p: 0.7, 
  frequency_penalty: 0.5,
  presence_penalty: 0.5
};

// Default base prompt text
export const defaultBasePromptText = 
`You are an expert ecommerce ad copywriter and marketing specialist. You create compelling, professional, and detailed prompts for AI image generators to create product advertisements. Each prompt should be detailed and specific, focusing on high-quality product photography, professional marketing aesthetics, and commercial appeal.

Create ${variation_count} different, 
detailed prompts for generating product advertisements with these specifications:

Product Image: ${product_image_url}
${brand_logo_url ? \`Brand Logo: ${brand_logo_url}\` : ''}
${reference_ad_url ? \`Reference Ad Style: ${reference_ad_url}\` : ''}
${instructions ? \`Additional Instructions: ${instructions}\` : ''}

Use the product and reference ad attached image thoroughly to come up with a prompt. The goal is to create variations of a successful ad attached as reference.

Each prompt should:
1. Detail a unique ad concept and style
2. Specify how the product should be presented
3. Describe lighting, background, and overall composition
4. Include marketing-oriented details like suggested text positioning or themes`;

/**
 * Check if the prompt editor feature flag is enabled
 */
export function isPromptEditorEnabled(): boolean {
  return isFeatureEnabled('enable-prompt-editor', false);
}

/**
 * Get the user's prompt template, or create it if it doesn't exist
 */
export async function getUserPromptTemplate(): Promise<PromptTemplate> {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Try to fetch the user's existing template
    const { data, error } = await supabase
      .from('prompt_templates')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      // If no template exists, create a default one
      if (error.code === 'PGRST116') { // Not found error
        return createDefaultPromptTemplate();
      }
      throw error;
    }
    
    return data as PromptTemplate;
  } catch (error) {
    console.error('Error fetching user prompt template:', error);
    // Return default template in case of errors
    return {
      base_prompt_text: defaultBasePromptText,
      custom_properties: defaultPromptTemplateProperties
    };
  }
}

/**
 * Create a default prompt template for the user
 */
export async function createDefaultPromptTemplate(): Promise<PromptTemplate> {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const defaultTemplate: PromptTemplate = {
      base_prompt_text: defaultBasePromptText,
      custom_properties: defaultPromptTemplateProperties,
      user_id: user.id
    };
    
    // Insert the default template
    const { data, error } = await supabase
      .from('prompt_templates')
      .insert(defaultTemplate)
      .select('*')
      .single();
    
    if (error) {
      throw error;
    }
    
    return data as PromptTemplate;
  } catch (error) {
    console.error('Error creating default prompt template:', error);
    throw error;
  }
}

/**
 * Save the user's prompt template
 */
export async function savePromptTemplate(template: PromptTemplate): Promise<PromptTemplate> {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Check if the user already has a template
    const { data: existingTemplate, error: fetchError } = await supabase
      .from('prompt_templates')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (fetchError && fetchError.code !== 'PGRST116') { // Not a "not found" error
      throw fetchError;
    }
    
    const now = new Date().toISOString();
    
    if (existingTemplate?.id) {
      // Update existing template
      const { data, error } = await supabase
        .from('prompt_templates')
        .update({
          base_prompt_text: template.base_prompt_text,
          custom_properties: template.custom_properties,
          last_modified_timestamp: now
        })
        .eq('id', existingTemplate.id)
        .select('*')
        .single();
        
      if (error) {
        throw error;
      }
      
      return data as PromptTemplate;
    } else {
      // Insert new template
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
          base_prompt_text: template.base_prompt_text,
          custom_properties: template.custom_properties,
          user_id: user.id,
          created_at: now,
          last_modified_timestamp: now
        })
        .select('*')
        .single();
      
      if (error) {
        throw error;
      }
      
      return data as PromptTemplate;
    }
  } catch (error) {
    console.error('Error saving prompt template:', error);
    throw error;
  }
}

/**
 * Reset the user's prompt template to default values
 */
export async function resetPromptTemplate(): Promise<PromptTemplate> {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const now = new Date().toISOString();
    
    // Update with default values
    const { data, error } = await supabase
      .from('prompt_templates')
      .upsert({
        base_prompt_text: defaultBasePromptText,
        custom_properties: defaultPromptTemplateProperties,
        user_id: user.id,
        last_modified_timestamp: now
      }, {
        onConflict: 'user_id'
      })
      .select('*')
      .single();
    
    if (error) {
      throw error;
    }
    
    return data as PromptTemplate;
  } catch (error) {
    console.error('Error resetting prompt template:', error);
    throw error;
  }
}