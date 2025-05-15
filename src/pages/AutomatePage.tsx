import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Check,
  ArrowLeft,
  Sparkles,
  Image as ImageIcon,
  Calendar,
  Download,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LazyImage } from '@/components/LazyImage';
import { Progress } from '@/components/ui/progress';
import { FileUpload } from '@/components/FileUpload';
import { ImageSelectionModal } from '@/components/ImageSelectionModal';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  // Step state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  // Input state
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [referenceAd, setReferenceAd] = useState<File | null>(null);
  const [referenceAdUrl, setReferenceAdUrl] = useState<string | null>(null);
  const [variationCount, setVariationCount] = useState('3');

  // Modal states
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [isReferenceSelectorOpen, setIsReferenceSelectorOpen] = useState(false);

  // Processing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [promptVariations, setPromptVariations] = useState<PromptVariation[]>([]);
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null);
  const [isJobDetailsOpen, setIsJobDetailsOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const latestJobsRef = useRef<GenerationJob[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Load recent jobs on mount
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

  // Subscribe to realtime updates for the current session
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
  
  // Fetch prompt variations and jobs when session changes
  useEffect(() => {
    if (!currentSession) return;
    
    fetchPromptVariations(currentSession.id);
    fetchGenerationJobs(currentSession.id);
  }, [currentSession]);

  // Fetch latest jobs
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

  // Fetch prompt variations for a session
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

  // Fetch generation jobs for a session
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

  // Navigation handlers
  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };
  
  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate(-1);
    }
  };

  // Form submission handler
  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      
      // Validate required fields
      if (!productImageUrl && !productImage) {
        toast({
          title: "Product image required",
          description: "Please select or upload a product image",
          variant: "destructive"
        });
        return;
      }
      
      // Create automation session
      const productFile = productImage;
      const referenceAdFile = referenceAd;
      
      const sessionId = await createAutomationSession(
        productFile!,
        null,
        referenceAdFile,
        "", // No instructions for now
        parseInt(variationCount, 10)
      );
      
      setCurrentSession({
        id: sessionId,
        status: 'draft',
        productImageUrl: productImageUrl || 'placeholder',
        referenceAdUrl: referenceAdUrl || undefined,
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

  // Action handlers
  const handleViewDetails = (job: GenerationJob) => {
    setSelectedJob(job);
    setIsJobDetailsOpen(true);
  };

  const handleDownloadImage = async (imageUrl: string, prompt: string) => {
    try {
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

  // Product image selection handler
  const handleProductImageSelected = (file: File | null, url: string | null) => {
    if (file) {
      setProductImage(file);
      setProductImageUrl(URL.createObjectURL(file));
    } else if (url) {
      setProductImage(null);
      setProductImageUrl(url);
    }
    
    // Automatically proceed to next step after selecting product image
    if (currentStep === 1) {
      setCurrentStep(2);
    }
  };
  
  // Reference image selection handler
  const handleReferenceImageSelected = (file: File | null, url: string | null) => {
    if (file) {
      setReferenceAd(file);
      setReferenceAdUrl(URL.createObjectURL(file));
    } else if (url) {
      setReferenceAd(null);
      setReferenceAdUrl(url);
    }
    
    // Automatically proceed to next step after selecting reference image
    if (currentStep === 2) {
      setCurrentStep(3);
    }
  };

  // Pre-set product images
  const presetProductImages = [
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6825431e0e40163357b11503_tshirt.png",
      alt: "T-shirt"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6825431d7de2ecdc9752ab83_chips.png",
      alt: "Chips"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6825431d247c1a4fe5715a7a_tinned%20seafood.png",
      alt: "Tinned seafood"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6825431d6ca848a38e4c351e_wallet.png",
      alt: "Wallet"
    }
  ];
  
  // Pre-set reference images
  const presetReferenceImages = [
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b21e23d6f431c8259e_reference%20scene%205.png",
      alt: "Reference Scene 5"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b2ce17a63e6c76c3ff_reference%20scene%203.png",
      alt: "Reference Scene 3"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b29edc65edaca8647f_reference%20scene%2013.png",
      alt: "Reference Scene 13"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b2c8cdf01f7f91f2cc_reference%20scene%208.png",
      alt: "Reference Scene 8"
    }
  ];

  // Handle preset image selection
  const handlePresetProductImageSelected = (url: string) => {
    setProductImage(null);
    setProductImageUrl(url);
    
    // Automatically proceed to next step after selecting product image
    if (currentStep === 1) {
      setCurrentStep(2);
    }
  };
  
  // Handle preset reference image selection
  const handlePresetReferenceImageSelected = (url: string) => {
    setReferenceAd(null);
    setReferenceAdUrl(url);
    
    // Automatically proceed to next step after selecting reference image
    if (currentStep === 2) {
      setCurrentStep(3);
    }
  };

  // Determine if the product image is set
  const hasProductImage = !!productImage || !!productImageUrl;
  
  // Determine if the reference ad is set
  const hasReferenceAd = !!referenceAd || !!referenceAdUrl;

  // Render step indicator
  const renderStepIndicator = () => {
    return (
      <div className="flex items-center justify-center w-full mb-4 md:mb-6">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const stepNum = index + 1;
          const isActive = currentStep === stepNum;
          const isCompleted = currentStep > stepNum;
          
          return (
            <div key={stepNum} className="flex items-center">
              <div 
                className={cn(
                  "flex items-center justify-center w-6 h-6 md:w-10 md:h-10 rounded-full text-xs md:text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground border-2 border-primary"
                    : isCompleted
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 md:h-5 md:w-5" />
                ) : (
                  stepNum
                )}
              </div>
              
              {/* Connector line between steps */}
              {stepNum < totalSteps && (
                <div 
                  className={cn(
                    "w-8 md:w-16 h-0.5 md:h-1 mx-0.5 md:mx-1",
                    currentStep > stepNum ? "bg-primary/50" : "bg-muted"
                  )} 
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Get step title
  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return "Select product image";
      case 2:
        return "Add a reference ad";
      case 3:
        return "Choose variations";
      default:
        return "";
    }
  };
  
  // Get step description
  const getStepDescription = () => {
    switch (currentStep) {
      case 1:
        return "Select or upload a product image to be featured in your ads.";
      case 2:
        return "Optionally add a reference ad to guide the style of your generated assets.";
      case 3:
        return "Choose the number of ad variations to generate.";
      default:
        return "";
    }
  };

  // Render the content for each step
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="max-w-xs md:max-w-2xl mx-auto mt-4 md:mt-8">
            {productImageUrl ? (
              <div className="border rounded-lg p-4 md:p-8 space-y-4 md:space-y-6 text-center">
                <div className="w-[200px] md:w-[250px] h-[200px] md:h-[250px] mx-auto">
                  <LazyImage 
                    src={productImageUrl}
                    alt="Product"
                    className="w-full h-full object-contain border rounded-md"
                  />
                </div>
                <div className="flex justify-center gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsProductSelectorOpen(true)}
                    size="sm"
                    className="text-xs md:text-sm h-8 md:h-10"
                  >
                    Change image
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setProductImage(null);
                      setProductImageUrl(null);
                    }}
                    size="sm"
                    className="text-xs md:text-sm h-8 md:h-10"
                  >
                    <X className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center w-full">
                <div className="w-full p-2 md:p-4">
                  <h3 className="text-sm md:text-lg font-medium mb-2 md:mb-3">Choose a product image</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                    {/* Add Upload button as first grid item */}
                    <div 
                      className="aspect-square border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer bg-muted/10 hover:bg-muted/20 transition-colors p-2 md:p-4"
                      onClick={() => setIsProductSelectorOpen(true)}
                    >
                      <ImageIcon className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground mb-1 md:mb-2" />
                      <span className="text-xs md:text-sm font-medium text-center">Upload Image</span>
                    </div>
                    
                    {/* Add preset product images */}
                    {presetProductImages.map((image, index) => (
                      <div 
                        key={index}
                        className="aspect-square border rounded-lg overflow-hidden cursor-pointer hover:border-primary transition-all"
                        onClick={() => handlePresetProductImageSelected(image.url)}
                      >
                        <LazyImage
                          src={image.url}
                          alt={image.alt}
                          className="w-full h-full object-contain p-1 md:p-2"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      
      case 2:
        return (
          <div className="max-w-xs md:max-w-2xl mx-auto mt-4 md:mt-8">
            {referenceAdUrl ? (
              <div className="border rounded-lg p-4 md:p-8 space-y-4 md:space-y-6 text-center">
                <div className="w-[200px] md:w-[250px] h-[200px] md:h-[250px] mx-auto">
                  <LazyImage 
                    src={referenceAdUrl}
                    alt="Reference Ad"
                    className="w-full h-full object-contain border rounded-md"
                  />
                </div>
                <div className="flex justify-center gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsReferenceSelectorOpen(true)}
                    size="sm"
                    className="text-xs md:text-sm h-8 md:h-10"
                  >
                    Change image
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setReferenceAd(null);
                      setReferenceAdUrl(null);
                    }}
                    size="sm"
                    className="text-xs md:text-sm h-8 md:h-10"
                  >
                    <X className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center w-full">
                <div className="w-full p-2 md:p-4">
                  <h3 className="text-sm md:text-lg font-medium mb-2 md:mb-3">Choose a reference ad (optional)</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                    {/* Add Upload button as first grid item */}
                    <div 
                      className="aspect-square border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer bg-muted/10 hover:bg-muted/20 transition-colors p-2 md:p-4"
                      onClick={() => setIsReferenceSelectorOpen(true)}
                    >
                      <ImageIcon className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground mb-1 md:mb-2" />
                      <span className="text-xs md:text-sm font-medium text-center">Upload Image</span>
                    </div>
                    
                    {/* Add preset reference images */}
                    {presetReferenceImages.map((image, index) => (
                      <div 
                        key={index}
                        className="aspect-square border rounded-lg overflow-hidden cursor-pointer hover:border-primary transition-all"
                        onClick={() => handlePresetReferenceImageSelected(image.url)}
                      >
                        <LazyImage
                          src={image.url}
                          alt={image.alt}
                          className="w-full h-full object-cover p-1 md:p-2"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      
      case 3:
        return (
          <div className="max-w-xs md:max-w-2xl mx-auto mt-4 md:mt-8">
            <div className="space-y-6 md:space-y-8">
              <div className="space-y-4 md:space-y-6 p-3 md:p-6 border rounded-lg">
                <div className="space-y-2 md:space-y-3">
                  <h3 className="text-sm md:text-lg font-medium">Number of Variations</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">Choose how many different ad variations to generate</p>
                  <Select 
                    value={variationCount} 
                    onValueChange={setVariationCount}
                  >
                    <SelectTrigger className="w-full text-xs md:text-sm h-9 md:h-10">
                      <SelectValue placeholder="3 variations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 variation</SelectItem>
                      <SelectItem value="2">2 variations</SelectItem>
                      <SelectItem value="3">3 variations</SelectItem>
                      <SelectItem value="5">5 variations</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-1 md:mt-2">
                    Each variation costs 1 credit. You will use {variationCount} credit{parseInt(variationCount) > 1 ? 's' : ''} for this generation.
                  </p>
                </div>

                {/* Summary section */}
                <div className="pt-4 mt-4 border-t">
                  <h3 className="text-sm md:text-lg font-medium mb-3">Summary</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {/* Product image summary */}
                    {productImageUrl && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Product Image</p>
                        <div className="aspect-square border rounded-lg overflow-hidden">
                          <LazyImage 
                            src={productImageUrl}
                            alt="Product"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Reference ad summary */}
                    {referenceAdUrl && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Reference Ad</p>
                        <div className="aspect-square border rounded-lg overflow-hidden">
                          <LazyImage 
                            src={referenceAdUrl}
                            alt="Reference"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-6">
                    <Button 
                      onClick={handleSubmit}
                      className="w-full py-4 md:py-6 text-sm md:text-lg h-auto"
                      disabled={!hasProductImage || isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 md:mr-3 h-4 w-4 md:h-5 md:w-5 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 md:mr-3 h-4 w-4 md:h-5 md:w-5" />
                          Generate {variationCount} ad{parseInt(variationCount) > 1 ? 's' : ''} ({variationCount} credit{parseInt(variationCount) > 1 ? 's' : ''})
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-background border-b py-3 md:py-4 px-3 md:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm"
            className="gap-1 md:gap-2 text-xs md:text-sm"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
            Back
          </Button>
          
          <h1 className="text-base md:text-xl font-semibold text-center flex-1 mr-12 md:mr-20">
            Create Automated Ads
          </h1>
          
          <div className="w-10"></div>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col">
        {/* Progress indicator section */}
        <div className="px-3 md:px-6 py-4 md:py-8">
          <div className="max-w-4xl mx-auto">
            {renderStepIndicator()}
            
            {/* Step title and description */}
            <div className="text-center mt-4 md:mt-8 mb-4 md:mb-8">
              <h2 className="text-lg md:text-2xl font-semibold mb-1 md:mb-2">{getStepTitle()}</h2>
              <p className="text-xs md:text-base text-muted-foreground">{getStepDescription()}</p>
            </div>
          </div>
        </div>
        
        {/* Progress indicator for current session */}
        {currentSession && progress > 0 && (
          <div className="px-3 md:px-6">
            <div className="max-w-4xl mx-auto mb-4 p-4 bg-muted/30 rounded-lg border">
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
          </div>
        )}
        
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-3 md:px-6 pb-24">
          <div className="min-h-[300px] md:min-h-[400px] max-w-7xl mx-auto">
            {renderStepContent()}
          </div>
          
          {/* Gallery view */}
          {generationJobs.length > 0 && (
            <div className="max-w-6xl mx-auto mt-8 mb-12">
              <h2 className="text-lg font-medium mb-4">Generated Ads</h2>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {generationJobs.map((job) => (
                  <div 
                    key={job.id}
                    className="relative group overflow-hidden rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
                  >
                    <div className="aspect-square w-full h-full bg-background">
                      {job.status === 'failed' ? (
                        <div className="w-full h-full flex items-center justify-center bg-red-50/50 dark:bg-red-900/10">
                          <div className="flex flex-col items-center text-center p-4">
                            <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
                            <span className="text-xs text-red-600">Generation failed</span>
                          </div>
                        </div>
                      ) : job.status === 'completed' && job.image_url ? (
                        <LazyImage
                          src={job.image_url}
                          alt="Generated ad"
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted/30">
                          <div className="animate-pulse flex flex-col items-center">
                            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                            <span className="mt-2 text-xs text-muted-foreground">
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* Sticky Footer */}
      <footer className="sticky bottom-0 z-10 bg-background border-t py-4 px-3 md:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="gap-1 md:gap-2 h-8 md:h-10 text-xs md:text-sm"
            disabled={isSubmitting}
          >
            <ChevronLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
            Back
          </Button>
          
          {currentStep < totalSteps && (
            <Button 
              size="sm"
              onClick={handleNext}
              className="gap-1 md:gap-2 h-8 md:h-10 text-xs md:text-sm"
              disabled={(currentStep === 1 && !hasProductImage) || isSubmitting}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </Button>
          )}
        </div>
      </footer>
      
      {/* Image selection modals */}
      <ImageSelectionModal
        open={isProductSelectorOpen}
        onOpenChange={setIsProductSelectorOpen}
        onImageSelected={handleProductImageSelected}
        title="Product Image"
        isProduct={true}
      />
      
      <ImageSelectionModal
        open={isReferenceSelectorOpen}
        onOpenChange={setIsReferenceSelectorOpen}
        onImageSelected={handleReferenceImageSelected}
        title="Reference Ad"
      />

      {/* Image Details Dialog */}
      <Dialog open={isJobDetailsOpen} onOpenChange={setIsJobDetailsOpen}>
        {selectedJob && (
          <DialogContent className="max-w-4xl md:max-w-5xl sm:max-w-[80%] p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle className="text-xl">Ad Details</DialogTitle>
              <DialogDescription>
                View your generated ad and reference images
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side - Generated Image */}
                <div className="space-y-4">
                  <h3 className="font-medium">Generated Ad</h3>
                  <div className="aspect-square rounded-lg overflow-hidden border bg-muted/30">
                    {selectedJob.status === 'failed' ? (
                      <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center">
                        <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                        <p className="text-sm font-medium">Generation failed</p>
                        <p className="text-xs text-muted-foreground mt-2">
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
                        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
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
                    <div className="p-4 border rounded-lg bg-muted/30 text-sm">
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
                            <p className="text-xs text-muted-foreground">Product Image</p>
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
                            <p className="text-xs text-muted-foreground">Reference Ad</p>
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
                        <p className="text-xs text-muted-foreground">Created</p>
                        <p className="flex items-center">
                          <Calendar className="h-3.5 w-3.5 mr-1.5" />
                          {selectedJob.created_at ? 
                            format(new Date(selectedJob.created_at), 'MMM d, yyyy HH:mm:ss') : 
                            'Unknown date'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
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