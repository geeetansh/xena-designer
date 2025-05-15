import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/FileUpload';
import { LazyImage } from '@/components/LazyImage';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { 
  Card,
  CardContent
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAutomationSession, generatePrompts } from '@/services/automationService';
import { Progress } from '@/components/ui/progress';
import { Loader2, Image as ImageIcon } from 'lucide-react';

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
  const [currentStep, setCurrentStep] = useState(1);
  const [productImage, setProductImage] = useState<File[]>([]);
  const [referenceAd, setReferenceAd] = useState<File[]>([]);
  const [variationCount, setVariationCount] = useState('3');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [promptVariations, setPromptVariations] = useState<PromptVariation[]>([]);
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [progress, setProgress] = useState(0);
  const latestJobsRef = useRef<GenerationJob[]>([]);
  
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

  // Fetch latest jobs automatically
  useEffect(() => {
    fetchLatestJobs();
    
    // Set up interval to fetch latest jobs every 10 seconds
    const interval = setInterval(() => {
      fetchLatestJobs();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);
  
  const fetchLatestJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('generation_jobs')
        .select('*, prompt_variations!inner(session_id, index)')
        .order('created_at', { ascending: false })
        .limit(10);
        
      if (error) {
        console.error('Error fetching latest jobs:', error);
        return;
      }
      
      latestJobsRef.current = data;
      setGenerationJobs(data);
    } catch (error) {
      console.error('Error fetching latest jobs:', error);
    }
  };

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

  const handleNext = () => {
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
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
        null,
        referenceAd.length > 0 ? referenceAd[0] : null,
        "", // No instructions for now
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
        title: "Campaign started",
        description: "Your ad campaign is being generated.",
      });
      
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

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Step 1: Select Product Image</h3>
            <FileUpload
              onFilesSelected={setProductImage}
              selectedFiles={productImage}
              maxFiles={1}
              singleFileMode={true}
              uploadType="Product Image"
              required={true}
            />
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Step 2: Add Reference Ad (Optional)</h3>
            <FileUpload
              onFilesSelected={setReferenceAd}
              selectedFiles={referenceAd}
              maxFiles={1}
              singleFileMode={true}
              uploadType="Reference Ad"
            />
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Step 3: Choose Number of Variations</h3>
            <Select 
              value={variationCount} 
              onValueChange={setVariationCount}
            >
              <SelectTrigger id="variation-count" className="w-full">
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
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full py-4 md:py-8">
      <div className="space-y-6">
        {/* Step banner */}
        <div className="bg-gradient-to-r from-background/80 to-background/40 rounded-lg p-4 border shadow-sm">
          <div className="flex justify-between mb-4">
            {[1, 2, 3].map((step) => (
              <Button
                key={step}
                variant={currentStep === step ? "default" : "outline"}
                onClick={() => setCurrentStep(step)}
                className="flex-1 mx-1"
              >
                Step {step}
              </Button>
            ))}
          </div>

          {/* Current step content */}
          <div className="p-4 border rounded-lg bg-card">
            {renderStepContent()}
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between mt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              Back
            </Button>
            
            {currentStep < 3 ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button 
                onClick={handleSubmit} 
                disabled={isSubmitting || productImage.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Start'
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Gallery view of generation jobs */}
        <div>
          <h2 className="text-lg font-medium mb-4">Generated Ads</h2>
          
          {currentSession && progress > 0 && (
            <div className="mb-4 p-4 bg-muted/30 rounded-lg border">
              <div className="flex items-center justify-between text-sm mb-2">
                <span>
                  {progress < 50 ? 'Generating prompts...' : 
                  progress < 100 ? 'Creating ads...' : 
                  'All ads completed!'}
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {generationJobs.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-lg border">
              <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No generated ads yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {generationJobs.map((job) => (
                <Card key={job.id} className="overflow-hidden">
                  <CardContent className="p-2">
                    <div className="aspect-square w-full h-auto bg-muted/30 rounded overflow-hidden relative">
                      {job.status === 'failed' ? (
                        <img 
                          src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/68100a4d9b154c0a40484bd8_ChatGPT%20Image%20Apr%2029%2C%202025%2C%2004_37_51%20AM.png"
                          alt="Failed generation"
                          className="w-full h-full object-cover"
                        />
                      ) : job.status === 'completed' && job.image_url ? (
                        <LazyImage
                          src={job.image_url}
                          alt="Generated ad"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="animate-pulse flex flex-col items-center">
                            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                            <span className="mt-2 text-xs text-muted-foreground">
                              {job.status}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}