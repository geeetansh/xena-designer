import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, Upload, Image as ImageIcon, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload } from '@/components/FileUpload';
import { LazyImage } from '@/components/LazyImage';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { 
  Card, 
  CardContent, 
  CardFooter, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { createAutomationSession, generatePrompts } from '@/services/automationService';
import { Progress } from '@/components/ui/progress';

interface Session {
  id: string;
  status: string;
  productImageUrl: string;
  brandLogoUrl?: string;
  referenceAdUrl?: string;
  instructions?: string;
  variationCount: number;
  created_at: string;
}

interface PromptVariation {
  id: string;
  prompt: string;
  index: number;
  status: string;
}

interface GenerationJob {
  id: string;
  variation_id: string;
  prompt: string;
  image_url?: string;
  status: string;
  error_message?: string;
}

export default function AutomatePage() {
  const [activeTab, setActiveTab] = useState("welcome");
  const [productImage, setProductImage] = useState<File[]>([]);
  const [brandLogo, setBrandLogo] = useState<File[]>([]);
  const [referenceAd, setReferenceAd] = useState<File[]>([]);
  const [instructions, setInstructions] = useState('');
  const [variationCount, setVariationCount] = useState('3');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [promptVariations, setPromptVariations] = useState<PromptVariation[]>([]);
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [progress, setProgress] = useState(0);
  
  const { toast } = useToast();

  // Subscribe to realtime updates for the session
  useEffect(() => {
    if (!currentSession) return;
    
    const sessionId = currentSession.id;
    
    // Subscribe to session updates
    const sessionChannel = supabase
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'automation_sessions',
          filter: `id=eq.${sessionId}`
        },
        (payload) => {
          const updatedSession = payload.new as any;
          setCurrentSession(prevSession => prevSession ? {
            ...prevSession,
            status: updatedSession.status
          } : null);

          // Update progress based on status
          if (updatedSession.status === 'prompts_generated') {
            setProgress(50);
          } else if (updatedSession.status === 'completed') {
            setProgress(100);
          }
        }
      )
      .subscribe();
    
    // Subscribe to generation job updates
    const jobsChannel = supabase
      .channel(`jobs-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generation_jobs',
          filter: `variation_id=in.(${promptVariations.map(v => `'${v.id}'`).join(',')})`
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Update the job in state
            setGenerationJobs(prev => {
              const exists = prev.some(job => job.id === payload.new.id);
              if (exists) {
                return prev.map(job => 
                  job.id === payload.new.id ? payload.new as GenerationJob : job
                );
              } else {
                return [...prev, payload.new as GenerationJob];
              }
            });
            
            // Update progress based on completed jobs
            fetchGenerationJobs(sessionId);
          }
        }
      )
      .subscribe();
    
    // Clean up subscriptions
    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, [currentSession, promptVariations]);
  
  // Fetch prompt variations for current session
  useEffect(() => {
    if (!currentSession) return;
    
    fetchPromptVariations(currentSession.id);
    fetchGenerationJobs(currentSession.id);
  }, [currentSession]);

  const fetchPromptVariations = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('prompt_variations')
        .select('*')
        .eq('session_id', sessionId)
        .order('index');
        
      if (error) {
        console.error('Error fetching prompt variations:', error);
        return;
      }
      
      setPromptVariations(data);
    } catch (error) {
      console.error('Error fetching prompt variations:', error);
    }
  };

  const fetchGenerationJobs = async (sessionId: string) => {
    try {
      // First get all variation IDs for this session
      const { data: variations, error: varError } = await supabase
        .from('prompt_variations')
        .select('id')
        .eq('session_id', sessionId);
        
      if (varError) {
        console.error('Error fetching variation IDs:', varError);
        return;
      }
      
      if (!variations || variations.length === 0) return;
      
      // Then get all jobs for these variation IDs
      const { data: jobs, error } = await supabase
        .from('generation_jobs')
        .select('*')
        .in('variation_id', variations.map(v => v.id));
        
      if (error) {
        console.error('Error fetching generation jobs:', error);
        return;
      }
      
      setGenerationJobs(jobs);
      
      // Calculate progress
      const totalJobs = jobs.length;
      const completedJobs = jobs.filter(job => job.status === 'completed').length;
      
      if (totalJobs > 0) {
        const baseProgress = 50; // We're already at 50% after prompt generation
        const imageProgress = 50 * (completedJobs / totalJobs); // The other 50% is for image generation
        setProgress(baseProgress + imageProgress);
      }
    } catch (error) {
      console.error('Error fetching generation jobs:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsSubmitting(true);
      
      // Validate required fields
      if (productImage.length === 0) {
        toast({
          title: "Product image required",
          description: "Please upload a product image to continue",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Create automation session
      const sessionId = await createAutomationSession(
        productImage[0],
        brandLogo.length > 0 ? brandLogo[0] : null,
        referenceAd.length > 0 ? referenceAd[0] : null,
        instructions,
        parseInt(variationCount, 10)
      );
      
      setCurrentSession({
        id: sessionId,
        status: 'draft',
        productImageUrl: 'placeholder', // Will be updated with real URLs later
        variationCount: parseInt(variationCount, 10),
        created_at: new Date().toISOString(),
      });
      
      toast({
        title: "Session created",
        description: "Your automation session has been created. Generating prompts...",
      });
      
      // Move to next step
      setActiveTab("progress");
      
      // Start generating prompts
      await generatePrompts(sessionId);
      
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'in_progress':
        return 'Processing';
      case 'queued':
        return 'Queued';
      default:
        return 'Unknown';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'in_progress':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'queued':
        return <Loader2 className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const renderWelcomeTab = () => (
    <div className="space-y-6">
      <Alert className="bg-primary/5 border border-primary/20">
        <Sparkles className="h-4 w-4 text-primary" />
        <AlertTitle className="text-base md:text-lg font-medium">Coming Soon</AlertTitle>
        <AlertDescription>
          <p className="text-sm md:text-base">
            The Automate feature is currently in development. Soon you'll be able to set up automated workflows for your image generation.
          </p>
          <p className="text-sm md:text-base mt-2">
            You can try our basic prototype below!
          </p>
        </AlertDescription>
      </Alert>
      
      <form onSubmit={handleSubmit} className="space-y-6 my-8 border rounded-lg p-4">
        <h2 className="text-lg font-medium">Create Automated Ad Campaign</h2>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="product-image">Product Image (Required)</Label>
              <FileUpload
                onFilesSelected={setProductImage}
                selectedFiles={productImage}
                maxFiles={1}
                singleFileMode={true}
                uploadType="Product Image"
                required={true}
              />
            </div>
            
            <div>
              <Label htmlFor="brand-logo">Brand Logo (Optional)</Label>
              <FileUpload
                onFilesSelected={setBrandLogo}
                selectedFiles={brandLogo}
                maxFiles={1}
                singleFileMode={true}
                uploadType="Brand Logo"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="reference-ad">Reference Ad (Optional)</Label>
            <FileUpload
              onFilesSelected={setReferenceAd}
              selectedFiles={referenceAd}
              maxFiles={1}
              singleFileMode={true}
              uploadType="Reference Ad"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="instructions">Additional Instructions (Optional)</Label>
            <Textarea
              id="instructions"
              placeholder="Enter any specific instructions or preferences for your ads..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              Include any specific details about your brand, target audience, preferred themes, or style guidance.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="variation-count">Number of Variations</Label>
            <Select 
              value={variationCount} 
              onValueChange={setVariationCount}
            >
              <SelectTrigger id="variation-count">
                <SelectValue placeholder="3 variations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 variation</SelectItem>
                <SelectItem value="2">2 variations</SelectItem>
                <SelectItem value="3">3 variations</SelectItem>
                <SelectItem value="5">5 variations</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Button type="submit" disabled={isSubmitting || productImage.length === 0}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Automated Ads'
          )}
        </Button>
      </form>
      
      <div className="mt-8">
        <h2 className="text-lg md:text-xl font-medium mb-4">What to expect</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <h3 className="text-base font-medium mb-2">Smart Prompt Generation</h3>
            <p className="text-sm text-muted-foreground">
              Our AI will analyze your product image and generate tailored prompts for creating ads.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="text-base font-medium mb-2">Multiple Ad Variations</h3>
            <p className="text-sm text-muted-foreground">
              Create several different ad styles and concepts from a single product image.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="text-base font-medium mb-2">Real-time Updates</h3>
            <p className="text-sm text-muted-foreground">
              Watch as your ads are generated and view results immediately when ready.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProgressTab = () => (
    <div className="space-y-6">
      <div className="bg-muted/20 p-4 rounded-lg border">
        <h2 className="text-lg font-medium mb-4">Generation Progress</h2>
        
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {progress < 50 ? 'Generating prompts...' : 
               progress < 100 ? 'Creating ads...' : 
               'All ads completed!'}
            </span>
            <span className="text-sm">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        
        {promptVariations.length > 0 && (
          <div className="space-y-4 mt-8">
            <h3 className="text-base font-medium">Generated Prompts</h3>
            <div className="space-y-2">
              {promptVariations.map((variation) => {
                const job = generationJobs.find(j => j.variation_id === variation.id);
                
                return (
                  <div key={variation.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-sm font-medium">Variation {variation.index + 1}</h4>
                      <div className="flex items-center">
                        {job && getStatusIcon(job.status)}
                        <span className="text-xs ml-1">{job ? getStatusLabel(job.status) : 'Waiting'}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="text-xs text-muted-foreground mb-1">Prompt</h5>
                        <p className="text-xs bg-muted/30 p-2 rounded max-h-32 overflow-y-auto">
                          {variation.prompt}
                        </p>
                      </div>
                      
                      {job && job.image_url && (
                        <div>
                          <h5 className="text-xs text-muted-foreground mb-1">Generated Image</h5>
                          <div className="aspect-square w-full h-auto bg-muted/30 rounded overflow-hidden">
                            <LazyImage
                              src={job.image_url}
                              alt={`Generated ad ${variation.index + 1}`}
                              className="object-cover w-full h-full"
                            />
                          </div>
                        </div>
                      )}
                      
                      {job && job.status === 'failed' && (
                        <div className="col-span-2">
                          <div className="bg-red-50 text-red-700 p-2 rounded text-xs">
                            Error: {job.error_message || 'Failed to generate image'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
        <div className="mt-6 flex justify-end">
          <Button 
            variant="outline" 
            onClick={() => setActiveTab("welcome")}
            className="mr-2"
          >
            Start New
          </Button>
          
          {progress === 100 && (
            <Button>
              Download All
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto w-full py-4 md:py-8">
      <h1 className="text-xl md:text-2xl font-bold mb-6">Automate</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="welcome">Home</TabsTrigger>
          {currentSession && (
            <TabsTrigger value="progress">Progress</TabsTrigger>
          )}
        </TabsList>
        
        <TabsContent value="welcome">
          {renderWelcomeTab()}
        </TabsContent>
        
        <TabsContent value="progress">
          {renderProgressTab()}
        </TabsContent>
      </Tabs>
    </div>
  );
}