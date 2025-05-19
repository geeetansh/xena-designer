import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Sparkles,
  Loader2,
  X,
  Check,
  ArrowLeft
} from 'lucide-react';
import { FaRegSquare } from "react-icons/fa";
import { LuRectangleHorizontal, LuRectangleVertical } from "react-icons/lu";
import { MdOutlineAutoAwesome } from "react-icons/md";
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LazyImage } from '@/components/LazyImage';
import { useToast } from '@/hooks/use-toast';
import { ImageSelectionModal } from '@/components/ImageSelectionModal';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getInstructions } from '@/services/settingsService';
import { createAutomationSession, generatePrompts } from '@/services/automationService';

export default function AutomationBuilderPage() {
  // Current step in the wizard (1-indexed for display purposes)
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  
  // Form data
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [referenceAd, setReferenceAd] = useState<File | null>(null);
  const [referenceAdUrl, setReferenceAdUrl] = useState<string | null>(null);
  const [variationCount, setVariationCount] = useState('3');
  const [selectedLayout, setSelectedLayout] = useState<string>("auto");
  
  // Instructions state
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState<string>("");
  const [availableInstructions, setAvailableInstructions] = useState<string[]>([]);
  const [selectedInstructions, setSelectedInstructions] = useState<Set<string>>(new Set());
  
  // Image selector modals
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [isReferenceSelectorOpen, setIsReferenceSelectorOpen] = useState(false);
  
  // Processing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentSession, setCurrentSession] = useState<{id: string, status: string} | null>(null);
  const [progress, setProgress] = useState(0);
  
  // Skeleton loading state for step transitions
  const [isStepLoading, setIsStepLoading] = useState(false);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Fetch available instructions when component mounts
  useEffect(() => {
    async function fetchInstructions() {
      try {
        const instructionsList = await getInstructions();
        setAvailableInstructions(instructionsList);
      } catch (error) {
        console.error("Error fetching instructions:", error);
      }
    }
    
    fetchInstructions();
  }, []);
  
  // Preset product images
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
  
  // Preset reference images
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
  
  // Helper function to convert URL to File
  const urlToFile = async (url: string, filename: string = 'product.jpg'): Promise<File> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
  };
  
  // Handle product image selection
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
      changeStep(2);
    }
  };
  
  // Handle preset image selection
  const handlePresetProductImageSelected = (url: string) => {
    setProductImage(null);
    setProductImageUrl(url);
    
    // Automatically proceed to next step after selecting product image
    if (currentStep === 1) {
      changeStep(2);
    }
  };
  
  // Handle reference image selection
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
      changeStep(3);
    }
  };
  
  // Handle preset reference image selection
  const handlePresetReferenceImageSelected = (url: string) => {
    setReferenceAd(null);
    setReferenceAdUrl(url);
    
    // Automatically proceed to next step after selecting reference image
    if (currentStep === 2) {
      changeStep(3);
    }
  };
  
  // Handle step navigation with skeleton animation
  const changeStep = (newStep: number) => {
    if (newStep !== currentStep) {
      setIsStepLoading(true);
      setTimeout(() => {
        setCurrentStep(newStep);
        setIsStepLoading(false);
      }, 500); // 0.5 second skeleton loading
    }
  };
  
  // Handle step navigation
  const handleNext = () => {
    // Validate current step
    if (currentStep === 1 && !hasProductImage) {
      toast({
        title: "Product image required",
        description: "Please select or upload a product image to continue",
        variant: "destructive"
      });
      return;
    }
    
    if (currentStep === 3) {
      // Final step, submit directly
      handleSubmit();
      return;
    }
    
    // Move to next step
    if (currentStep < totalSteps) {
      changeStep(currentStep + 1);
    }
  };
  
  const handleBack = () => {
    if (currentStep > 1) {
      changeStep(currentStep - 1);
    } else {
      // If on first step, go back to previous page
      navigate(-1);
    }
  };
  
  // Toggle instruction in the prompt
  const toggleInstruction = (text: string) => {
    const newSelectedInstructions = new Set(selectedInstructions);
    
    if (selectedInstructions.has(text)) {
      // Remove the instruction
      newSelectedInstructions.delete(text);
      
      // Update the instructions by removing this instruction
      const parts = instructions.split(/[,.]\s*/);
      const newParts = parts.filter(part => part.trim() !== text.trim());
      setInstructions(newParts.join(', ').trim());
    } else {
      // Add the instruction
      newSelectedInstructions.add(text);
      if (instructions) {
        setInstructions(`${instructions}, ${text}`);
      } else {
        setInstructions(text);
      }
    }
    
    setSelectedInstructions(newSelectedInstructions);
  };
  
  // Form submission handler
  const handleSubmit = async () => {
    // Validate requirements
    if (!productImageUrl && !productImage) {
      toast({
        title: "Product image required",
        description: "Please select or upload a product image",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Create automation session
      let productImageFile = productImage;
      
      // If we have a URL but no file, convert URL to File
      if (!productImageFile && productImageUrl) {
        try {
          // Extract filename from URL to preserve file extension
          const filename = productImageUrl.split('/').pop() || 'product.jpg';
          productImageFile = await urlToFile(productImageUrl, filename);
          console.log('Successfully converted product image URL to File object');
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
          console.log('Successfully converted reference ad URL to File object');
        } catch (error) {
          console.error('Error converting reference ad URL to File:', error);
          // We can continue without reference ad
          console.log('Continuing without reference ad');
        }
      }
      
      // Create session
      const sessionId = await createAutomationSession(
        productImageFile,
        null, // No brand logo for now
        referenceAdFile,
        showInstructions ? instructions : "", // Only include instructions if enabled
        parseInt(variationCount, 10),
        selectedLayout // Pass the selected layout
      );
      
      setCurrentSession({
        id: sessionId,
        status: 'draft'
      });
      
      toast({
        title: 'Campaign started',
        description: 'Your automated ad campaign is being generated. You can view progress on the automate page.'
      });
      
      // Start generating prompts
      await generatePrompts(sessionId);
      
      // Show progress updates
      setProgress(10);
      
      // Simulate progress updates for better UX
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            clearInterval(interval);
            return 100;
          }
          return prev + 5;
        });
      }, 1000);
      
      // Navigate to the automate page to see results after a short delay
      setTimeout(() => {
        navigate('/automate');
      }, 3000);
      
    } catch (error) {
      console.error("Error creating automation:", error);
      toast({
        title: "Failed to create automation",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Determine if product image is selected
  const hasProductImage = !!productImage || !!productImageUrl;
  
  // Determine if reference image is selected
  const hasReferenceAd = !!referenceAd || !!referenceAdUrl;
  
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
        return "Upload the product you wish to transform or choose from our sample images.";
      case 2:
        return "Optionally add a reference ad to guide the style of your assets.";
      case 3:
        return "Choose the layout and number of ad variations to generate.";
      default:
        return "";
    }
  };
  
  // Render skeleton loaders for step content
  const renderSkeletonContent = () => {
    switch (currentStep) {
      case 1:
      case 2:
        return (
          <div className="max-w-xs md:max-w-2xl mx-auto mt-4 md:mt-8">
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-4">
              {Array.from({ length: 12 }).map((_, index) => (
                <Skeleton key={index} className="aspect-square w-full h-full rounded-lg" />
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="max-w-xs md:max-w-2xl mx-auto mt-4 md:mt-8">
            <Skeleton className="w-full h-[400px] md:h-[500px] rounded-lg" />
          </div>
        );
      default:
        return null;
    }
  };
  
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
  
  // Render step content
  const renderStepContent = () => {
    // Show skeleton during step transitions
    if (isStepLoading) {
      return renderSkeletonContent();
    }
    
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
                  
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-4">
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
                  
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-4">
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

              {/* Variation Count */}
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
              
              {/* Instructions Toggle */}
              <div className="space-y-2 md:space-y-3 pt-2 md:pt-3 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm md:text-lg font-medium">Add Instructions</h3>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      Provide specific instructions for your ad generation
                    </p>
                  </div>
                  <Switch 
                    checked={showInstructions}
                    onCheckedChange={setShowInstructions}
                    id="instructions-toggle"
                  />
                </div>
                
                {/* Instructions Input and Preset Options */}
                {showInstructions && (
                  <div className="pt-3 space-y-4 animate-in fade-in-50 slide-in-from-top-5 duration-300">
                    <div className="space-y-2">
                      <Label htmlFor="instructions" className="text-sm font-medium">Instructions</Label>
                      <Textarea
                        id="instructions"
                        placeholder="Add specific instructions for your ad generation..."
                        className="min-h-[100px] resize-none"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                      />
                    </div>
                    
                    {/* Preset Instructions */}
                    {availableInstructions.length > 0 && (
                      <div className="space-y-2 border rounded-lg p-3 md:p-4 bg-muted/10">
                        <Label className="text-sm font-medium">Preset Instructions</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Click to add these common instructions
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {availableInstructions.map((instruction, index) => (
                            <Button
                              key={index}
                              type="button"
                              variant={selectedInstructions.has(instruction) ? "default" : "outline"}
                              size="sm"
                              className="text-xs rounded-full h-7"
                              onClick={() => toggleInstruction(instruction)}
                            >
                              {selectedInstructions.has(instruction) && (
                                <Check className="h-3 w-3 mr-1" />
                              )}
                              {instruction}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                
                {/* Instructions summary */}
                {showInstructions && instructions && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-muted-foreground">Instructions</p>
                    <div className="border rounded-lg p-2 md:p-3 bg-muted/10">
                      <p className="text-xs md:text-sm">{instructions}</p>
                    </div>
                  </div>
                )}
                
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
        );
        
      default:
        return null;
    }
  };

  // Determine if the next button should be disabled
  const isNextButtonDisabled = () => {
    if (currentStep === 1 && !hasProductImage) {
      return true;
    }
    
    return isSubmitting || isStepLoading;
  };
  
  // Get button text based on current step
  const getNextButtonText = () => {
    if (currentStep === totalSteps) {
      return isSubmitting ? "Creating..." : "Generate";
    } else if (currentStep === totalSteps - 1) {
      return "Review";
    } else {
      return "Continue";
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
      
      {/* Progress indicator for current session */}
      {currentSession && progress > 0 && (
        <div className="fixed top-16 left-0 right-0 z-50 bg-background border-b">
          <div className="max-w-7xl mx-auto px-4 py-3">
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
      
      <main className="flex-1 flex flex-col">
        {/* Progress indicator section - not part of scrollable area */}
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
        
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-3 md:px-6 pb-24">
          <div className="min-h-[300px] md:min-h-[400px] max-w-7xl mx-auto">
            {renderStepContent()}
          </div>
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
            disabled={isSubmitting || isStepLoading}
          >
            <ChevronLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
            Back
          </Button>
          
          {currentStep < totalSteps && (
            <Button 
              size="sm"
              onClick={handleNext}
              className="gap-1 md:gap-2 h-8 md:h-10 text-xs md:text-sm"
              disabled={isNextButtonDisabled()}
            >
              {isStepLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  {getNextButtonText()}
                  <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </>
              )}
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
    </div>
  );
}