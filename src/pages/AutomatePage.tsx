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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAutomationSession, generatePrompts } from '@/services/automationService';
import { Progress } from '@/components/ui/progress';
import { 
  Check, 
  Loader2, 
  Image as ImageIcon, 
  Eye, 
  Download, 
  AlertTriangle, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  MapPin 
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
  created_at: string;
  prompt_variations?: any;
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
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null);
  const [isJobDetailsOpen, setIsJobDetailsOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const latestJobsRef = useRef<GenerationJob[]>([]);
  
  const { toast } = useToast();
  const totalSteps = 4;

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
    setIsLoading(true);
    fetchLatestJobs()
      .finally(() => setIsLoading(false));
    
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
        .select(`
          *,
          prompt_variations!inner(
            session_id,
            index,
            automation_sessions(
              product_image_url,
              reference_ad_url,
              created_at
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);
        
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
    if (currentStep < totalSteps) {
      // Validate required fields for Step 1
      if (currentStep === 1 && productImage.length === 0) {
        toast({
          title: "Product image required",
          description: "Please upload a product image to continue",
          variant: "destructive"
        });
        return;
      }
      
      setCurrentStep(prev => prev + 1);
    }
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

  const handleViewDetails = (job: GenerationJob) => {
    setSelectedJob(job);
    setIsJobDetailsOpen(true);
  };

  const handleDownloadImage = async (imageUrl: string, prompt: string) => {
    try {
      // Always download the original image, not the optimized version
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xena-ad-${prompt.substring(0, 20).replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Image downloaded",
        description: "The ad image has been downloaded successfully"
      });
    } catch (error) {
      console.error('Error downloading image:', error);
      toast({
        title: "Download failed",
        description: "Failed to download the image",
        variant: "destructive"
      });
    }
  };

  // Render step progress indicator to match the design
  const renderStepIndicator = () => {
    return (
      <div className="flex items-center justify-center w-full">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const stepNum = index + 1;
          const isActive = currentStep === stepNum;
          const isCompleted = currentStep > stepNum;
          
          return (
            <div key={stepNum} className="flex items-center">
              <div className="relative">
                <div 
                  className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-full text-sm font-medium z-10 relative",
                    isActive 
                      ? "bg-green-100 border-2 border-dashed border-green-500" // Current step
                      : isCompleted
                        ? "bg-green-100" // Completed step
                        : "bg-gray-100" // Future step
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-6 w-6 text-green-500" />
                  ) : (
                    <span className={cn(
                      "text-lg",
                      isActive ? "text-black" : "text-gray-500"
                    )}>{stepNum}</span>
                  )}
                </div>
                
                {/* Adds ring for active step */}
                {isActive && (
                  <div className="absolute inset-0 rounded-full border-2 border-green-500 animate-pulse"></div>
                )}
              </div>
              
              {/* Connector line between steps */}
              {stepNum < totalSteps && (
                <div 
                  className={cn(
                    "w-32 h-0.5",
                    isCompleted ? "bg-green-500" : "bg-gray-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Render the cards that match the reference design
  const renderStepCards = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Product Image */}
        <Card className={cn(
          "overflow-hidden",
          currentStep === 1 ? "ring-2 ring-green-500" : "",
          currentStep < 1 ? "border border-dashed" : ""
        )}>
          <CardContent className="p-0">
            <div className="p-4">
              {productImage.length > 0 ? (
                <div className="mb-4">
                  <img 
                    src={URL.createObjectURL(productImage[0])} 
                    alt="Product" 
                    className="w-full aspect-square object-cover rounded-md border"
                  />
                </div>
              ) : (
                <div className="mb-4 w-full aspect-square rounded-md border border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                  <ImageIcon className="h-12 w-12 text-gray-300" />
                </div>
              )}

              <div className="w-full">
                {currentStep === 1 && (
                  <FileUpload
                    onFilesSelected={setProductImage}
                    selectedFiles={productImage}
                    maxFiles={1}
                    singleFileMode={true}
                    uploadType="Product Image"
                    required={true}
                  />
                )}

                {currentStep !== 1 && productImage.length === 0 && (
                  <Button
                    variant="ghost"
                    className="w-full border border-dashed border-gray-300 py-2 bg-gray-50 text-gray-500"
                    onClick={() => setCurrentStep(1)}
                  >
                    <span className="mr-2">📦</span> Select product
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Reference Ad */}
        <Card className={cn(
          "overflow-hidden",
          currentStep === 2 ? "ring-2 ring-green-500" : "",
          currentStep < 2 ? "border border-dashed" : ""
        )}>
          <CardContent className="p-0">
            <div className="p-4">
              {referenceAd.length > 0 ? (
                <div className="mb-4">
                  <img 
                    src={URL.createObjectURL(referenceAd[0])} 
                    alt="Reference" 
                    className="w-full aspect-square object-cover rounded-md border"
                  />
                </div>
              ) : (
                <div className="mb-4 w-full aspect-square rounded-md border border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                  {currentStep >= 2 ? (
                    <ImageIcon className="h-12 w-12 text-gray-300" />
                  ) : (
                    <div className="text-center text-gray-400">
                      <span className="text-sm">Step 2</span>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 2 && (
                <FileUpload
                  onFilesSelected={setReferenceAd}
                  selectedFiles={referenceAd}
                  maxFiles={1}
                  singleFileMode={true}
                  uploadType="Reference Ad"
                />
              )}

              {currentStep !== 2 && referenceAd.length === 0 && currentStep >= 2 && (
                <Button
                  variant="ghost"
                  className="w-full border border-dashed border-gray-300 py-2 bg-gray-50 text-gray-500"
                  onClick={() => setCurrentStep(2)}
                >
                  <span className="mr-2">🎨</span> Select reference ad
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Variations */}
        <Card className={cn(
          "overflow-hidden",
          currentStep === 3 ? "ring-2 ring-green-500" : "",
          currentStep < 3 ? "border border-dashed" : "",
          currentStep === 3 ? "bg-white" : "bg-gray-50"
        )}>
          <CardContent className="p-0">
            <div className="p-4">
              <div className="mb-4 w-full aspect-square rounded-md border border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50">
                {currentStep >= 3 ? (
                  <div className="p-6 flex flex-col items-center">
                    <h3 className="text-lg font-medium mb-4 text-gray-700">Variations</h3>
                    {currentStep === 3 ? (
                      <div className="w-full space-y-4">
                        <p className="text-sm text-gray-500">
                          Choose how many ad variations you want to generate
                        </p>
                        
                        <Select 
                          value={variationCount} 
                          onValueChange={setVariationCount}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="3 variations" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 variation</SelectItem>
                            <SelectItem value="2">2 variations</SelectItem>
                            <SelectItem value="3">3 variations</SelectItem>
                            <SelectItem value="5">5 variations</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <div className="text-sm text-gray-500">
                          <p>Each variation will use 1 credit</p>
                          <p className="mt-1">Total cost: {variationCount} credits</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        {currentStep > 3 ? (
                          <div className="flex flex-col items-center">
                            <Check className="h-10 w-10 text-green-500 mb-2" />
                            <p className="text-sm font-medium">{variationCount} variations</p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Choose variations</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <span className="text-sm">Step 3</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Final Step */}
        <Card className={cn(
          "overflow-hidden",
          currentStep === 4 ? "ring-2 ring-green-500" : "",
          currentStep < 4 ? "border border-dashed" : "",
          currentStep === 4 ? "bg-white" : "bg-gray-50"
        )}>
          <CardContent className="p-0">
            <div className="p-4">
              <div className="mb-4 w-full aspect-square rounded-md border border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50">
                {currentStep >= 4 ? (
                  <div className="flex flex-col items-center p-6">
                    <h3 className="text-lg font-medium mb-2 text-gray-700">Final Step</h3>
                    <p className="text-sm text-gray-500 text-center mb-4">
                      Review and complete
                    </p>
                    
                    {currentSession ? (
                      <div className="flex flex-col items-center">
                        <Check className="h-10 w-10 text-green-500 mb-2" />
                        <p className="text-sm font-medium">Campaign Started</p>
                      </div>
                    ) : (
                      <MapPin className="h-10 w-10 text-gray-300" />
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <span className="text-sm">Step 4</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto w-full py-4 md:py-8">
      <h1 className="text-2xl font-bold mb-8">Automate Ad Creation</h1>
      
      <div className="relative rounded-xl border p-6 md:p-8 bg-white mb-8">
        {/* Step indicator */}
        <div className="mb-10">
          {renderStepIndicator()}
        </div>
        
        {/* Step cards */}
        {renderStepCards()}
        
        {/* Progress indicator for current session */}
        {currentSession && progress > 0 && (
          <div className="mt-6 mb-4 p-4 bg-gray-50 rounded-lg border">
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
        
        {/* Navigation buttons */}
        <div className="flex justify-between mt-8">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 1 || isSubmitting}
            className="flex items-center"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          
          {currentStep < totalSteps ? (
            <Button 
              onClick={handleNext}
              disabled={(currentStep === 1 && productImage.length === 0) || isSubmitting}
              className="bg-gray-800 hover:bg-gray-700"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting || productImage.length === 0}
              className="bg-gray-800 hover:bg-gray-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Campaign...
                </>
              ) : (
                'Create Campaign'
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Gallery view of generation jobs */}
      <div>
        <h2 className="text-lg font-bold mb-4">Generated Ads</h2>
        
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-gray-200 animate-pulse" />
            ))}
          </div>
        ) : generationJobs.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border">
            <ImageIcon className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500">No generated ads yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {generationJobs.map((job) => (
              <Card
                key={job.id}
                className="relative group overflow-hidden transition-all duration-200 hover:shadow-md"
              >
                <CardContent className="p-0">
                  <div className="aspect-square w-full h-full bg-background">
                    {job.status === 'failed' ? (
                      <div className="w-full h-full flex items-center justify-center bg-rose-50 text-rose-500">
                        <AlertTriangle className="h-10 w-10" />
                      </div>
                    ) : job.status === 'completed' && job.image_url ? (
                      <LazyImage
                        src={job.image_url}
                        alt="Generated ad"
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-50">
                        <div className="animate-pulse flex flex-col items-center">
                          <Loader2 className="h-8 w-8 text-gray-300 animate-spin" />
                          <span className="mt-2 text-xs text-gray-400">
                            {job.status}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end">
                    <div className="p-3 md:p-4 space-y-1">
                      <h3 className="text-white font-medium text-xs md:text-sm line-clamp-1">
                        Generated Ad
                      </h3>
                      <p className="text-white/80 text-[10px] md:text-xs">
                        {job.created_at ? format(new Date(job.created_at), 'MMM d, yyyy') : ''}
                      </p>
                      <div className="flex justify-between mt-1 md:mt-2">
                        <Button 
                          size="sm" 
                          variant="secondary"
                          className="rounded-full shadow-lg text-xs h-7 px-2 md:h-8 md:px-3"
                          onClick={() => handleViewDetails(job)}
                        >
                          <Eye className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                          View
                        </Button>
                        
                        <Button 
                          size="sm" 
                          variant="secondary"
                          className="rounded-full shadow-lg h-7 w-7 p-0 md:h-8 md:w-8"
                          onClick={() => job.image_url && handleDownloadImage(job.image_url, job.prompt.substring(0, 30))}
                          disabled={!job.image_url || job.status !== 'completed'}
                        >
                          <Download className="h-3 w-3 md:h-4 md:w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Image Details Dialog */}
      <Dialog open={isJobDetailsOpen} onOpenChange={setIsJobDetailsOpen}>
        {selectedJob && (
          <DialogContent className="max-w-4xl md:max-w-5xl sm:max-w-[80%] p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle className="text-xl">Ad Details</DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side - Generated Image */}
                <div className="space-y-4">
                  <h3 className="font-medium">Generated Ad</h3>
                  <div className="aspect-square rounded-lg overflow-hidden border bg-gray-50">
                    {selectedJob.status === 'failed' ? (
                      <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center">
                        <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                        <p className="text-sm font-medium">Generation failed</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {selectedJob.error_message || "The ad could not be generated"}
                        </p>
                      </div>
                    ) : selectedJob.status === 'completed' && selectedJob.image_url ? (
                      <img
                        src={selectedJob.image_url}
                        alt="Generated ad"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Loader2 className="h-10 w-10 animate-spin text-gray-300" />
                      </div>
                    )}
                  </div>
                  
                  {/* Download button */}
                  {selectedJob.status === 'completed' && selectedJob.image_url && (
                    <Button 
                      onClick={() => handleDownloadImage(selectedJob.image_url!, selectedJob.prompt.substring(0, 30))}
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Image
                    </Button>
                  )}
                </div>
                
                {/* Right side - Details */}
                <div className="space-y-4">
                  {/* Prompt */}
                  <div className="space-y-2">
                    <h3 className="font-medium">Prompt</h3>
                    <div className="p-4 border rounded-lg bg-gray-50 text-sm">
                      <p>{selectedJob.prompt}</p>
                    </div>
                  </div>
                  
                  {/* Reference Images */}
                  {selectedJob.prompt_variations && (
                    <div className="space-y-2">
                      <h3 className="font-medium">Reference Images</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Product Image */}
                        {selectedJob.prompt_variations.automation_sessions?.product_image_url && (
                          <div className="space-y-1">
                            <p className="text-xs text-gray-500">Product Image</p>
                            <div className="aspect-square border rounded-md overflow-hidden">
                              <LazyImage
                                src={selectedJob.prompt_variations.automation_sessions.product_image_url}
                                alt="Product"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* Reference Ad */}
                        {selectedJob.prompt_variations.automation_sessions?.reference_ad_url && (
                          <div className="space-y-1">
                            <p className="text-xs text-gray-500">Reference Ad</p>
                            <div className="aspect-square border rounded-md overflow-hidden">
                              <LazyImage
                                src={selectedJob.prompt_variations.automation_sessions.reference_ad_url}
                                alt="Reference"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Created Date */}
                  <div className="space-y-2">
                    <h3 className="font-medium">Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Created</p>
                        <p className="flex items-center">
                          <Calendar className="h-3.5 w-3.5 mr-1.5" />
                          {selectedJob.created_at ? 
                            format(new Date(selectedJob.created_at), 'MMM d, yyyy HH:mm:ss') : 
                            'Unknown date'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Status</p>
                        <p className="capitalize">{selectedJob.status}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter className="px-4 py-3 border-t">
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}