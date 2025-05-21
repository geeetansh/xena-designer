import { supabase } from '@/lib/supabase';

// Default instructions that will be used if user hasn't set custom ones
const DEFAULT_INSTRUCTIONS = [
  "Place product on a clean white backdrop",
  "Capture a tight shot highlighting textures and features",
  "Arrange product (and accessories) in a top-down layout",
  "Use soft, even daylight to show true colors",
  "Go bright and airy with minimal shadows",
  "Show hands or a person interacting with the product",
  "Include the product's packaging in frame",
  "Add one simple prop (e.g., a leaf or cloth) for context",
  "Blur the background to focus on the product",
  "Position product on a subtle glass or mirror base"
];

// Retrieve instructions from user settings
export async function getInstructions(): Promise<string[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return DEFAULT_INSTRUCTIONS;
    }
    
    // Get user settings
    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('photoshoot_instructions')
      .eq('user_id', user.id)
      .single();
    
    // If no settings or no instructions, return default
    if (error || !settings || !settings.photoshoot_instructions) {
      return DEFAULT_INSTRUCTIONS;
    }
    
    // If instructions are stored as string, parse them
    if (typeof settings.photoshoot_instructions === 'string') {
      try {
        return JSON.parse(settings.photoshoot_instructions);
      } catch (e) {
        return DEFAULT_INSTRUCTIONS;
      }
    }
    
    // If they're already an array
    if (Array.isArray(settings.photoshoot_instructions)) {
      return settings.photoshoot_instructions;
    }
    
    return DEFAULT_INSTRUCTIONS;
  } catch (error) {
    console.error('Error fetching instructions:', error);
    return DEFAULT_INSTRUCTIONS;
  }
}

// Save instructions to user settings
export async function saveInstructions(instructions: string[]): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Check if settings exist
    const { data: existingSettings } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (existingSettings) {
      // Update existing settings
      await supabase
        .from('user_settings')
        .update({
          photoshoot_instructions: instructions,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
    } else {
      // Create new settings
      await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          photoshoot_instructions: instructions
        });
    }
    
    return true;
  } catch (error) {
    console.error('Error saving instructions:', error);
    return false;
  }
}

// Get all user settings
export async function getUserSettings() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }
    
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') { // Not found error
        return null;
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching user settings:', error);
    return null;
  }
}

// Save all user settings
export async function saveUserSettings(settings: any): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Check if settings exist
    const { data: existingSettings } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (existingSettings) {
      // Update existing settings
      await supabase
        .from('user_settings')
        .update({
          ...settings,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
    } else {
      // Create new settings
      await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          ...settings
        });
    }
    
    return true;
  } catch (error) {
    console.error('Error saving user settings:', error);
    return false;
  }
}