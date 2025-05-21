import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Sparkles, 
  RotateCcw, 
  Info,
  Loader2,
  Check 
} from 'lucide-react';

import { ResizablePanel, ResizableHandle, ResizablePanelGroup } from '@/components/ui/resizable';
import { useToast } from '@/hooks/use-toast';
import { trackEvent } from '@/lib/posthog';
import { 
  PromptTemplate, 
  PromptTemplateProperties, 
  defaultPromptTemplateProperties,
  defaultBasePromptText,
  getUserPromptTemplate,
  savePromptTemplate,
  resetPromptTemplate
} from '@/services/promptSettingsService';

// Form schema for prompt template validation
const promptTemplateSchema = z.object({
  base_prompt_text: z.string().min(10, {
    message: "Prompt must be at least 10 characters long",
  }),
  temperature: z.number().min(0).max(1),
  max_tokens: z.number().int().min(1).max(4000),
  top_p: z.number().min(0).max(1),
  frequency_penalty: z.number().min(-2).max(2),
  presence_penalty: z.number().min(-2).max(2),
});

type PromptTemplateFormValues = {
  base_prompt_text: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
};

export function PromptTemplateSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const { toast } = useToast();
  
  // Form setup
  const form = useForm<PromptTemplateFormValues>({
    resolver: zodResolver(promptTemplateSchema),
    defaultValues: {
      base_prompt_text: defaultBasePromptText,
      temperature: defaultPromptTemplateProperties.temperature,
      max_tokens: defaultPromptTemplateProperties.max_tokens,
      top_p: defaultPromptTemplateProperties.top_p,
      frequency_penalty: defaultPromptTemplateProperties.frequency_penalty,
      presence_penalty: defaultPromptTemplateProperties.presence_penalty,
    },
  });
  
  // Load user's prompt template
  useEffect(() => {
    loadPromptTemplate();
  }, []);
  
  // Load the user's prompt template from the database
  const loadPromptTemplate = async () => {
    try {
      setIsLoading(true);
      const template = await getUserPromptTemplate();
      
      // Update form values
      form.reset({
        base_prompt_text: template.base_prompt_text,
        temperature: template.custom_properties.temperature,
        max_tokens: template.custom_properties.max_tokens,
        top_p: template.custom_properties.top_p,
        frequency_penalty: template.custom_properties.frequency_penalty,
        presence_penalty: template.custom_properties.presence_penalty,
      });
      
    } catch (error) {
      console.error('Error loading prompt template:', error);
      toast({
        title: 'Failed to load settings',
        description: 'Your prompt settings could not be loaded',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle form submission
  const onSubmit = async (values: PromptTemplateFormValues) => {
    try {
      setIsSaving(true);
      
      // Transform form values to prompt template format
      const template: PromptTemplate = {
        base_prompt_text: values.base_prompt_text,
        custom_properties: {
          temperature: values.temperature,
          max_tokens: values.max_tokens,
          top_p: values.top_p,
          frequency_penalty: values.frequency_penalty,
          presence_penalty: values.presence_penalty,
        },
      };
      
      // Save the template
      await savePromptTemplate(template);
      
      // Track the event
      trackEvent('prompt_template_updated', {
        temperature: values.temperature,
        max_tokens: values.max_tokens,
      });
      
      toast({
        title: 'Settings saved',
        description: 'Your prompt settings have been updated',
      });
    } catch (error) {
      console.error('Error saving prompt template:', error);
      toast({
        title: 'Failed to save settings',
        description: 'Your prompt settings could not be saved',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle reset to defaults
  const handleReset = async () => {
    try {
      setIsResetting(true);
      await resetPromptTemplate();
      
      // Update form with default values
      form.reset({
        base_prompt_text: defaultBasePromptText,
        temperature: defaultPromptTemplateProperties.temperature,
        max_tokens: defaultPromptTemplateProperties.max_tokens,
        top_p: defaultPromptTemplateProperties.top_p,
        frequency_penalty: defaultPromptTemplateProperties.frequency_penalty,
        presence_penalty: defaultPromptTemplateProperties.presence_penalty,
      });
      
      // Track the event
      trackEvent('prompt_template_reset');
      
      toast({
        title: 'Settings reset',
        description: 'Your prompt settings have been reset to defaults',
      });
    } catch (error) {
      console.error('Error resetting prompt template:', error);
      toast({
        title: 'Failed to reset settings',
        description: 'Your prompt settings could not be reset',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
    }
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Prompt Settings</CardTitle>
          <CardDescription>
            Customize how AI generates prompts for your images
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Prompt Settings
            </CardTitle>
            <CardDescription>
              Customize how AI generates prompts for your images
            </CardDescription>
          </div>
          <div className="flex space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleReset}
                    disabled={isResetting}
                  >
                    {isResetting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to defaults</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="editor">Prompt Editor</TabsTrigger>
            <TabsTrigger value="parameters">Parameters</TabsTrigger>
          </TabsList>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <ResizablePanelGroup direction="vertical" className="min-h-[500px]">
                <TabsContent value="editor" className="mt-0">
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="base_prompt_text"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex justify-between items-center">
                            <FormLabel>Base Prompt</FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" type="button">
                                    <Info className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[300px]">
                                  <p>This is the base prompt that will be used to generate variations. 
                                  You can use the following variables: ${variation_count}, ${product_image_url}, 
                                  ${brand_logo_url}, ${reference_ad_url}, ${instructions}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="Enter your base prompt here"
                              className="min-h-[300px] font-mono text-sm resize-none"
                            />
                          </FormControl>
                          <FormDescription>
                            The base prompt template for generating variant prompts. Available variables: 
                            <code className="ml-1 text-xs">$&#123;variation_count&#125;</code>,
                            <code className="ml-1 text-xs">$&#123;product_image_url&#125;</code>,
                            <code className="ml-1 text-xs">$&#123;brand_logo_url&#125;</code>,
                            <code className="ml-1 text-xs">$&#123;reference_ad_url&#125;</code>,
                            <code className="ml-1 text-xs">$&#123;instructions&#125;</code>
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="parameters" className="space-y-6 mt-0">
                  <ResizablePanel defaultSize={100}>
                    <div className="space-y-6 p-2">
                      <FormField
                        control={form.control}
                        name="temperature"
                        render={({ field: { onChange, value, ...rest } }) => (
                          <FormItem>
                            <div className="flex justify-between items-center">
                              <FormLabel>Temperature</FormLabel>
                              <span className="text-xs text-muted-foreground">{value.toFixed(2)}</span>
                            </div>
                            <div className="pt-2">
                              <Slider
                                {...rest}
                                min={0}
                                max={1}
                                step={0.01}
                                value={[value]}
                                onValueChange={(vals) => onChange(vals[0])}
                              />
                            </div>
                            <FormDescription className="flex justify-between text-xs">
                              <span>More Precise</span>
                              <span>More Creative</span>
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="max_tokens"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex justify-between items-center">
                              <FormLabel>Max Tokens</FormLabel>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" type="button">
                                      <Info className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[300px]">
                                    <p>Maximum number of tokens (words) to generate. Higher values allow for longer, more detailed prompts.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number"
                                min={1}
                                max={4000}
                                onChange={e => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormDescription>
                              Limit the token count for generated prompts
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="top_p"
                        render={({ field: { onChange, value, ...rest } }) => (
                          <FormItem>
                            <div className="flex justify-between items-center">
                              <FormLabel>Top P (Sampling)</FormLabel>
                              <span className="text-xs text-muted-foreground">{value.toFixed(2)}</span>
                            </div>
                            <div className="pt-2">
                              <Slider
                                {...rest}
                                min={0}
                                max={1}
                                step={0.01}
                                value={[value]}
                                onValueChange={(vals) => onChange(vals[0])}
                              />
                            </div>
                            <FormDescription className="flex justify-between text-xs">
                              <span>More Focused</span>
                              <span>More Diverse</span>
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="frequency_penalty"
                          render={({ field: { onChange, value, ...rest } }) => (
                            <FormItem>
                              <div className="flex justify-between items-center">
                                <FormLabel>Frequency Penalty</FormLabel>
                                <span className="text-xs text-muted-foreground">{value.toFixed(2)}</span>
                              </div>
                              <div className="pt-2">
                                <Slider
                                  {...rest}
                                  min={-2}
                                  max={2}
                                  step={0.01}
                                  value={[value]}
                                  onValueChange={(vals) => onChange(vals[0])}
                                />
                              </div>
                              <FormDescription className="flex justify-between text-xs">
                                <span>Repetitive</span>
                                <span>Varied</span>
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="presence_penalty"
                          render={({ field: { onChange, value, ...rest } }) => (
                            <FormItem>
                              <div className="flex justify-between items-center">
                                <FormLabel>Presence Penalty</FormLabel>
                                <span className="text-xs text-muted-foreground">{value.toFixed(2)}</span>
                              </div>
                              <div className="pt-2">
                                <Slider
                                  {...rest}
                                  min={-2}
                                  max={2}
                                  step={0.01}
                                  value={[value]}
                                  onValueChange={(vals) => onChange(vals[0])}
                                />
                              </div>
                              <FormDescription className="flex justify-between text-xs">
                                <span>Focused</span>
                                <span>Exploratory</span>
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </ResizablePanel>
                </TabsContent>
              </ResizablePanelGroup>
              
              <div className="flex justify-end space-x-2 mt-6">
                <Button variant="outline" type="button" onClick={() => form.reset()}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || !form.formState.isDirty}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </Tabs>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <p className="text-xs text-muted-foreground">
          These settings control how AI generates prompt variations. Custom properties like variation_count, product_image_url, etc. will be automatically replaced with actual values.
        </p>
      </CardFooter>
    </Card>
  );
}