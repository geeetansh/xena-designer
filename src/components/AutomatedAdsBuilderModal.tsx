import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Check,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import { FaRegSquare } from "react-icons/fa";
import { LuRectangleHorizontal, LuRectangleVertical } from "react-icons/lu";
import { MdOutlineAutoAwesome } from "react-icons/md";
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { LazyImage } from '@/components/LazyImage';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ImageSelectionModal } from '@/components/ImageSelectionModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { 
  createAutomationSession, 
  generatePrompts, 
  checkUserCreditsForAutomation 
} from '@/services/automationService';

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

interface AutomatedAdsBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (sessionId: string) => void;
}

export function AutomatedAdsBuilderModal({ open, onOpenChange, onSuccess }: AutomatedAdsBuilderModalProps) {
  // Step state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  // Input state
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [referenceAd, setReferenceAd] = useState<File | null>(null);
  const [referenceAdUrl, setReferenceAdUrl] = useState<string | null>(null);
  const [variationCount, setVariationCount] = useState('3');
  const [selectedLayout, setSelectedLayout] = useState<string>("auto");
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [checkingCredits, setCheckingCredits] = useState(false);
  const [insufficientCredits, setInsufficientCredits] = useState(false);

  // Modal states
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [isReferenceSelectorOpen, setIsReferenceSelectorOpen] = useState(false);

  // Processing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState(0);

  const { toast } = useToast();
  const navigate = useNavigate();

  // Reset the form when the modal is opened
  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      setProductImage(null);
      setProductImageUrl(null);
      setReferenceAd(null);
      setReferenceAdUrl(null);
      setVariationCount('3');
      setSelectedLayout("auto");
      setCurrentSession(null);
      setProgress(0);
      setIsSubmitting(false);
      setInsufficientCredits(false);
      
      // Check user credits when modal opens
      checkCredits();
    }
  }, [open]);
  
  // Check user credits
  const checkCredits = async () => {
    try {
      setCheckingCredits(true);
      const { hasCredits, credits } = await checkUserCreditsForAutomation(parseInt(variationCount, 10));
      setUserCredits(credits);
      setInsufficientCredits(!hasCredits);
    } catch (error) {
      console.error("Error checking credits:", error);
      setInsufficientCredits(true);
    } finally {
      setCheckingCredits(false);
    }
  };
  
  // Re-check credits when variation count changes
  useEffect(() => {
    if (open) {
      checkCredits();
    }
  }, [variationCount, open]);

  // Navigation handlers
  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };
  
  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Helper function to convert URL to File
  const urlToFile = async (url: string, filename: string = 'product.jpg'): Promise<File> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
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
      
      // Check if user has sufficient credits
      const requiredCredits = parseInt(variationCount, 10);
      const { hasCredits, credits } = await checkUserCreditsForAutomation(requiredCredits);
      
      if (!hasCredits) {
        toast({
          title: 'Insufficient credits',
          description: `You need ${requiredCredits} credits for this generation but only have ${credits} available.`,
          variant: 'destructive'
        });
        setInsufficientCredits(true);
        return;
      }
      
      // Process product image
      let productImageFile = productImage;
      
      // If we have a URL but no file, convert URL to File
      if (!productImageFile && productImageUrl) {
        try {
          // Extract filename from URL to preserve file extension
          const filename = productImageUrl.split('/').pop() || 'product.jpg';
          productImageFile = await urlToFile(productImageUrl, filename);
        } catch (error) {
          console.error('Error converting product image URL to File:', error);
          throw new Error("Failed to process product image. Please try uploading a different image.");
        }
      }
      
      // Additional validation to ensure we have a productImageFile
      if (!productImageFile) {
        throw new Error("Product image is required. Please select or upload an image.");
      }
      
      // Process reference ad if it's a URL
      let referenceAdFile = referenceAd;
      if (!referenceAdFile && referenceAdUrl) {
        try {
          const filename = referenceAdUrl.split('/').pop() || 'reference.jpg';
          referenceAdFile = await urlToFile(referenceAdUrl, filename);
        } catch (error) {
          console.error('Error converting reference ad URL to File:', error);
          // We can continue without reference ad
        }
      }
      
      // Create automation session
      const sessionId = await createAutomationSession(
        productImageFile,
        null, // No brand logo for now
        referenceAdFile,
        "", // No instructions for now
        parseInt(variationCount, 10),
        selectedLayout // Pass the selected layout
      );
      
      setCurrentSession({
        id: sessionId,
        status: 'draft',
        productImageUrl: productImageUrl || 'placeholder',
        referenceAdUrl: referenceAdUrl || undefined,
        variationCount: parseInt(variationCount, 10),
        created_at: new Date().toISOString(),
      });
      
      // Show success toast
      toast({
        title: "Campaign started",
        description: "Your ad campaign is being generated. You can view progress here.",
      });
      
      // Start generating prompts
      await generatePrompts(sessionId);
      
      // Close the modal if requested and notify parent of success
      if (onSuccess) {
        onSuccess(sessionId);
      }
      
      // Navigate to the static ads page (/automate)
      navigate('/automate');
      
      // Close the modal
      onOpenChange(false);
      
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
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6825431dcfcaed5d40724f24_olipop%20soda.png",
      alt: "Olipop soda"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6825431df1682e2c71a58b1f_decor.png",
      alt: "Decor"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6825431d04cb73592f9b5cb6_glossier%20balm.png",
      alt: "Glossier balm"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6825431d69a16680c6922986_women%20shoes.png",
      alt: "Women shoes"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6825431d5468408b5477b52a_table.png",
      alt: "Table"
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
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b2d9c7e4efe0e75b5e_reference%20scene%2014.png",
      alt: "Reference Scene 14"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b2f2f786d6f8aa3327_reference%20scene%209.png",
      alt: "Reference Scene 9"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b2f55fd3be87756dc3_reference%20scene%207.png",
      alt: "Reference Scene 7"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b13973e79578bf492b_reference%20scene%202.png",
      alt: "Reference Scene 2"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b15e4efdead1d12c21_reference%20scene%2012.png",
      alt: "Reference Scene 12"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b11e7c5a92ae84d2de_reference%20scene%2011.png",
      alt: "Reference Scene 11"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b1753b5f462896b7ee_reference%20scene%206.png",
      alt: "Reference Scene 6"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b19edc65edaca863f5_reference%20scene%201.png",
      alt: "Reference Scene 1"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b1c0841b0ca5448196_reference%20scene%204.png",
      alt: "Reference Scene 4"
    },
    {
      url: "https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/682556b128fe17d4fb6b2b51_reference%20scene%2010.png",
      alt: "Reference Scene 10"
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
        return "Choose layout and variations";
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
        return "Choose the layout and number of ad variations to generate.";
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
                    alt="Reference"
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
            <div className="space-y-6 md:space-y-8 p-3 md:p-6 border rounded-lg">
              {/* Layout selection */}
              <div className="space-y-2 md:space-y-3">
                <h3 className="text-sm md:text-lg font-medium">Choose layout</h3>
                <p className="text-xs md:text-sm text-muted-foreground">Select the shape and format of your generated ads</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mt-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex flex-col items-center p-2 md:p-4 rounded-lg cursor-pointer border-2 transition-all",
                            selectedLayout === "square" 
                              ? "border-primary bg-primary/5" 
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => setSelectedLayout("square")}
                        >
                          <FaRegSquare className="h-8 w-8 md:h-12 md:w-12 mb-1 md:mb-2" />
                          <span className="font-medium text-xs md:text-base">Square</span>
                          <span className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">1:1</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Square (1:1)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex flex-col items-center p-2 md:p-4 rounded-lg cursor-pointer border-2 transition-all",
                            selectedLayout === "landscape" 
                              ? "border-primary bg-primary/5" 
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => setSelectedLayout("landscape")}
                        >
                          <LuRectangleHorizontal className="h-8 w-8 md:h-12 md:w-12 mb-1 md:mb-2" />
                          <span className="font-medium text-xs md:text-base">Landscape</span>
                          <span className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">3:2</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Landscape (3:2)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex flex-col items-center p-2 md:p-4 rounded-lg cursor-pointer border-2 transition-all",
                            selectedLayout === "portrait" 
                              ? "border-primary bg-primary/5" 
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => setSelectedLayout("portrait")}
                        >
                          <LuRectangleVertical className="h-8 w-8 md:h-12 md:w-12 mb-1 md:mb-2" />
                          <span className="font-medium text-xs md:text-base">Portrait</span>
                          <span className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">2:3</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Portrait (2:3)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex flex-col items-center p-2 md:p-4 rounded-lg cursor-pointer border-2 transition-all",
                            selectedLayout === "auto" 
                              ? "border-primary bg-primary/5" 
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => setSelectedLayout("auto")}
                        >
                          <MdOutlineAutoAwesome className="h-8 w-8 md:h-12 md:w-12 mb-1 md:mb-2" />
                          <span className="font-medium text-xs md:text-base">Auto</span>
                          <span className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">Best Fit</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Auto (Best Fit)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              
              <div className="space-y-2 md:space-y-3">
                <h3 className="text-sm md:text-lg font-medium">Number of Variations</h3>
                <p className="text-xs md:text-sm text-muted-foreground">Choose how many different ad variations to generate</p>
                <Select 
                  value={variationCount} 
                  onValueChange={(value) => {
                    setVariationCount(value);
                  }}
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
                
                <div className="text-[10px] md:text-xs text-muted-foreground mt-1 md:mt-2">
                  {checkingCredits ? (
                    "Checking available credits..."
                  ) : (
                    <>
                      Each variation costs 1 credit. You will use {variationCount} credit{parseInt(variationCount) > 1 ? 's' : ''} for this generation.
                      {userCredits !== null && (
                        <div className="mt-1">
                          You have <span className={insufficientCredits ? "text-red-500 font-bold" : "font-medium"}>{userCredits}</span> credits available.
                        </div>
                      )}
                      {insufficientCredits && (
                        <div className="text-red-500 mt-1">
                          You need more credits to generate this many variations.
                        </div>
                      )}
                    </>
                  )}
                </div>
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
                    disabled={!hasProductImage || isSubmitting || insufficientCredits}
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
                  
                  {insufficientCredits && (
                    <Button
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => navigate('/pricing')}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Get More Credits
                    </Button>
                  )}
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] max-h-[900px] p-0 flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-2 border-b sticky top-0 bg-background z-10">
          <DialogTitle className="text-xl font-semibold">Create Automated Ads</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto px-4 py-4">
          {/* Progress indicator for current session */}
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
          
          {/* Step indicator */}
          {renderStepIndicator()}
          
          {/* Step title and description */}
          <div className="text-center mt-4 mb-6">
            <h2 className="text-lg md:text-xl font-semibold mb-1">{getStepTitle()}</h2>
            <p className="text-xs md:text-sm text-muted-foreground">{getStepDescription()}</p>
          </div>
          
          {/* Step content */}
          {renderStepContent()}
        </div>
        
        <DialogFooter className="px-4 py-3 border-t sticky bottom-0 bg-background z-10">
          <div className="w-full flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              className="gap-1 h-9 text-sm"
              disabled={currentStep === 1 || isSubmitting}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            
            {currentStep < totalSteps && (
              <Button 
                size="sm"
                onClick={handleNext}
                className="gap-1 h-9 text-sm"
                disabled={(currentStep === 1 && !hasProductImage) || isSubmitting}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
      
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
    </Dialog>
  );
}