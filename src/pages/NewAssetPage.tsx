import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft,
  ChevronRight,
  Upload, 
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
import { PiSmileySad } from "react-icons/pi";
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { LazyImage } from '@/components/LazyImage';
import { ImageSelectionModal } from '@/components/ImageSelectionModal';
import { getInstructions } from '@/services/settingsService';
import { createPhotoshoot } from '@/services/photoshootService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function NewAssetPage() {
  // Current step in the wizard (1-indexed for display purposes)
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6;
  
  // Asset type selection
  const [assetType, setAssetType] = useState<'photoshoot' | 'static_ad'>('photoshoot');
  
  // Form data
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [assetName, setAssetName] = useState('');
  
  // Instructions
  const [instructions, setInstructions] = useState<string[]>([]);
  const [selectedInstructions, setSelectedInstructions] = useState<Set<string>>(new Set());
  
  // Layout selection
  const [selectedLayout, setSelectedLayout] = useState<string>("auto");
  
  // Variants count
  const [variantCount, setVariantCount] = useState('1');
  
  // Image selector modals
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [isReferenceSelectorOpen, setIsReferenceSelectorOpen] = useState(false);
  
  // Loading state
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Load instructions when component mounts
  useEffect(() => {
    loadInstructions();
  }, []);
  
  // Load instructions from settings
  const loadInstructions = async () => {
    try {
      const instructionList = await getInstructions();
      setInstructions(instructionList);
    } catch (error) {
      console.error('Error loading instructions:', error);
      // Fallback to default instructions if error
      setInstructions([
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
      ]);
    }
  };
  
  useEffect(() => {
    // Generate a name based on the product image filename or URL if not set yet
    if ((productImage || productImageUrl) && !assetName) {
      let productName = "Product Image";
      
      if (productImage) {
        // Use the filename without extension
        const filename = productImage.name;
        const nameWithoutExtension = filename.split('.').slice(0, -1).join('.');
        productName = nameWithoutExtension || "Product Image";
      } else if (productImageUrl) {
        // Try to extract a name from the URL
        try {
          const url = new URL(productImageUrl);
          const pathParts = url.pathname.split('/');
          const lastPart = pathParts[pathParts.length - 1];
          const nameWithoutExtension = lastPart.split('.').slice(0, -1).join('.');
          if (nameWithoutExtension) {
            productName = nameWithoutExtension.replace(/-|_/g, ' ');
          }
        } catch (e) {
          // If URL parsing fails, just use default
          productName = "Product Image";
        }
      }
      
      // Capitalize the first letter of each word
      productName = productName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
        
      setAssetName(productName);
    }
  }, [productImage, productImageUrl, assetName]);
  
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
    if (currentStep === 2) {
      setCurrentStep(3);
    }
  };
  
  // Handle reference image selection
  const handleReferenceImageSelected = (file: File | null, url: string | null) => {
    if (file) {
      setReferenceImage(file);
      setReferenceImageUrl(URL.createObjectURL(file));
    } else if (url) {
      setReferenceImage(null);
      setReferenceImageUrl(url);
    }
    
    // Automatically proceed to next step after selecting reference image
    if (currentStep === 3) {
      setCurrentStep(4);
    }
  };
  
  // Toggle instruction in the prompt
  const toggleInstruction = (text: string) => {
    const newSelectedInstructions = new Set(selectedInstructions);
    
    if (selectedInstructions.has(text)) {
      // Remove the instruction
      newSelectedInstructions.delete(text);
      // Update the prompt by removing this instruction
      const parts = prompt.split(/,\s*/);
      const newParts = parts.filter(part => part.trim() !== text.trim());
      setPrompt(newParts.join(', ').trim());
    } else {
      // Add the instruction
      newSelectedInstructions.add(text);
      if (prompt) {
        setPrompt(`${prompt}, ${text}`);
      } else {
        setPrompt(text);
      }
    }
    
    setSelectedInstructions(newSelectedInstructions);
  };
  
  // Handle step navigation
  const handleNext = () => {
    // For Step 1, go directly to Step 2
    if (currentStep === 1) {
      setCurrentStep(2);
      return;
    }
    
    // Validate other steps
    if (currentStep === 2 && !productImage && !productImageUrl) {
      toast({
        title: "Product image required",
        description: "Please select or upload a product image to continue",
        variant: "destructive"
      });
      return;
    }
    
    if (currentStep === 5 && !prompt.trim()) {
      toast({
        title: "Instructions required",
        description: "Please enter instructions for your creation",
        variant: "destructive"
      });
      return;
    }
    
    if (currentStep === 6) {
      // Final step, submit directly
      handleSubmit();
      return;
    }
    
    // Move to next step
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };
  
  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      // If on first step, go back to previous page
      navigate(-1);
    }
  };
  
  // Handle asset type selection
  const handleAssetTypeSelect = (type: 'photoshoot' | 'static_ad') => {
    setAssetType(type);
  };
  
  // Handle form submission
  const handleSubmit = async () => {
    // Validate requirements
    if (!productImageUrl && !productImage) {
      toast({
        title: "Product image required",
        description: "Please select or upload a product image",
        variant: "destructive"
      });
      setCurrentStep(2);
      return;
    }
    
    if (!prompt.trim()) {
      toast({
        title: "Instructions required",
        description: "Please enter instructions for your creation",
        variant: "destructive"
      });
      setCurrentStep(5);
      return;
    }
    
    if (!assetName.trim()) {
      toast({
        title: "Name required",
        description: "Please provide a name for your asset",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await createPhotoshoot(
        assetName,
        prompt,
        productImage,
        productImageUrl,
        referenceImage,
        referenceImageUrl,
        selectedLayout,
        parseInt(variantCount, 10),
        assetType
      );
      
      toast({
        title: 'Asset creation started',
        description: 'Your images are being generated. You can view progress on the photoshoot page.'
      });
      
      // Navigate to photoshoot page instead of gallery
      navigate('/photoshoot');
    } catch (error) {
      console.error("Error creating photoshoot:", error);
      toast({
        title: "Failed to create asset",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Get step title based on current step
  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return "What would you like to create?";
      case 2:
        return "Select your product image";
      case 3:
        return "Add a reference image";
      case 4:
        return "Choose layout and variations";
      case 5:
        return "Add instructions";
      case 6:
        return "Review and confirm";
      default:
        return "";
    }
  };
  
  // Get step description based on current step
  const getStepDescription = () => {
    switch (currentStep) {
      case 1:
        return "Choose the type of asset you want to create";
      case 2:
        return "Choose the product you wish to transform. High-quality PNG photos will result in the best output.";
      case 3:
        return "Optionally add a reference image to guide the style of your asset.";
      case 4:
        return "Choose the layout and number of variations to generate.";
      case 5:
        return "Describe how you want to transform your product image.";
      case 6:
        return "Review your selections before creating your new asset.";
      default:
        return "";
    }
  };
  
  // Determine if product image is selected
  const hasProductImage = productImage !== null || productImageUrl !== null;
  
  // Determine if reference image is selected
  const hasReferenceImage = referenceImage !== null || referenceImageUrl !== null;
  
  // Render step progress indicator
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
  
  // Render step content based on current step
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 max-w-4xl mx-auto mt-4 md:mt-8">
            <Card 
              className={cn(
                "border-2 overflow-hidden cursor-pointer transition-all", 
                assetType === 'photoshoot' ? "ring-2 ring-primary border-primary" : "hover:bg-muted/40"
              )}
              onClick={() => handleAssetTypeSelect('photoshoot')}
            >
              <CardContent className="p-3 md:p-6">
                <div className="flex flex-col">
                  <div className="aspect-video overflow-hidden rounded-lg mb-2 md:mb-4 relative">
                    <LazyImage 
                      src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6813f044660d7695cc48b000_iconic-convert-product-imag.png"
                      alt="Photoshoots"
                      className="w-full h-full object-cover"
                    />
                    {assetType === 'photoshoot' && (
                      <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-base md:text-xl font-medium">Photoshoots</h3>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1 md:mt-2">
                    Generate exceptionally looking photoshoots for your products in different settings and moods.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card 
              className={cn(
                "border-2 overflow-hidden cursor-pointer transition-all", 
                assetType === 'static_ad' ? "ring-2 ring-primary border-primary" : "hover:bg-muted/40"
              )}
              onClick={() => handleAssetTypeSelect('static_ad')}
            >
              <CardContent className="p-3 md:p-6">
                <div className="flex flex-col">
                  <div className="aspect-video overflow-hidden rounded-lg mb-2 md:mb-4 relative">
                    <LazyImage 
                      src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6813f0507f8b3038b447e8e6_download%20(2).png"
                      alt="Social Ads"
                      className="w-full h-full object-cover"
                    />
                    {assetType === 'static_ad' && (
                      <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-base md:text-xl font-medium">Static ads</h3>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1 md:mt-2">
                    Generate static ads for your next campaign in vertical, horizontal and square formats!
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      
      case 2:
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
                <div className="w-full border-2 border-dashed rounded-lg p-6 md:p-10 flex flex-col items-center justify-center text-center">
                  <Upload className="h-10 w-10 md:h-16 md:w-16 text-muted-foreground mb-3 md:mb-6" />
                  <h3 className="text-lg md:text-xl font-medium mb-2 md:mb-3">Upload Product Image</h3>
                  <p className="text-xs md:text-sm text-muted-foreground mb-4 md:mb-6 max-w-xs md:max-w-md">
                    Drag and drop your product image here, or click the button below to browse your files.
                    The image should be high quality and show your product clearly.
                  </p>
                  <Button 
                    onClick={() => setIsProductSelectorOpen(true)} 
                    size="sm" 
                    className="h-8 md:h-10 text-xs md:text-sm"
                  >
                    Select product image
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
        
      case 3:
        return (
          <div className="max-w-xs md:max-w-2xl mx-auto mt-4 md:mt-8">            
            {referenceImageUrl ? (
              <div className="border rounded-lg p-4 md:p-8 space-y-4 md:space-y-6 text-center">
                <div className="w-[200px] md:w-[250px] h-[200px] md:h-[250px] mx-auto">
                  <LazyImage 
                    src={referenceImageUrl}
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
                      setReferenceImage(null);
                      setReferenceImageUrl(null);
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
                <div className="w-full border-2 border-dashed rounded-lg p-6 md:p-10 flex flex-col items-center justify-center text-center">
                  <ImageIcon className="h-10 w-10 md:h-16 md:w-16 text-muted-foreground mb-3 md:mb-6" />
                  <h3 className="text-lg md:text-xl font-medium mb-2 md:mb-3">Upload Reference Image</h3>
                  <p className="text-xs md:text-sm text-muted-foreground mb-4 md:mb-6 max-w-xs md:max-w-md">
                    Add a reference image to guide the style of your creation. This step is optional but can help achieve more specific results.
                  </p>
                  <div className="flex flex-col md:flex-row gap-2 md:gap-4">
                    <Button 
                      onClick={() => setIsReferenceSelectorOpen(true)}
                      size="sm"
                      className="h-8 md:h-10 text-xs md:text-sm"
                    >
                      Select reference image
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setCurrentStep(4)}
                      size="sm"
                      className="h-8 md:h-10 text-xs md:text-sm"
                    >
                      Skip this step
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
        
      case 4:
        return (
          <div className="max-w-xs md:max-w-2xl mx-auto mt-4 md:mt-8">
            <div className="space-y-6 md:space-y-8 p-3 md:p-6 border rounded-lg">
              {/* Asset name */}
              <div className="space-y-2 md:space-y-3">
                <Label htmlFor="assetName" className="text-sm md:text-lg font-medium">Name your asset</Label>
                <p className="text-xs md:text-sm text-muted-foreground">Give your creation a memorable name</p>
                <Input
                  id="assetName"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="My Product Photoshoot"
                  className="w-full text-sm md:text-lg py-4 md:py-6"
                />
              </div>
              
              {/* Layout and Variations in separate sections */}
              <div className="space-y-4 md:space-y-6">
                <div className="space-y-2 md:space-y-3">
                  <Label className="text-sm md:text-lg font-medium">Choose layout</Label>
                  <p className="text-xs md:text-sm text-muted-foreground">Select the shape and format of your generated image</p>
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
                  <Label htmlFor="variants" className="text-sm md:text-lg font-medium">Number of variations</Label>
                  <p className="text-xs md:text-sm text-muted-foreground">Choose how many different versions to generate (uses more credits)</p>
                  <Select 
                    value={variantCount} 
                    onValueChange={setVariantCount}
                  >
                    <SelectTrigger className="w-full text-xs md:text-sm h-9 md:h-10">
                      <SelectValue placeholder="1 variation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 variation</SelectItem>
                      <SelectItem value="2">2 variations</SelectItem>
                      <SelectItem value="3">3 variations</SelectItem>
                      <SelectItem value="5">5 variations</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-1 md:mt-2">
                    Each variation costs 1 credit. You will use {variantCount} credit{parseInt(variantCount) > 1 ? 's' : ''} for this generation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
        
      case 5:
        return (
          <div className="max-w-xs md:max-w-3xl mx-auto mt-4 md:mt-8">
            <div className="space-y-4 md:space-y-8">
              {/* Instructions textarea */}
              <div className="space-y-2 md:space-y-3">
                <Label htmlFor="instructions" className="text-sm md:text-lg font-medium">Write your instructions</Label>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Describe in detail how you want your product transformed. Be specific about style, setting, lighting, and mood.
                </p>
                <div className="bg-gradient-to-r from-background/80 to-background/40 backdrop-blur-sm border border-border/40 rounded-lg p-3 md:p-5 shadow-sm">
                  <Textarea
                    id="instructions"
                    placeholder="Describe what you want Xena to do..."
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      
                      // Update selected instructions based on prompt content
                      const newSelectedInstructions = new Set<string>();
                      const promptParts = e.target.value.split(/,\s*/);
                      
                      instructions.forEach(instruction => {
                        if (promptParts.some(part => part.trim() === instruction.trim())) {
                          newSelectedInstructions.add(instruction);
                        }
                      });
                      
                      setSelectedInstructions(newSelectedInstructions);
                    }}
                    className="bg-transparent border-none shadow-none text-sm md:text-base focus-visible:ring-0 focus-visible:ring-offset-0 px-0 min-h-[100px] md:min-h-[150px] resize-none"
                  />
                </div>
              </div>
              
              {/* Preset instructions */}
              <div className="space-y-2 md:space-y-3 bg-muted/20 p-3 md:p-6 rounded-lg">
                <Label className="text-sm md:text-lg font-medium">Preset instructions</Label>
                <p className="text-xs md:text-sm text-muted-foreground">Click any of these to add them to your instructions</p>
                <div className="flex flex-wrap gap-1.5 md:gap-2 mt-2 md:mt-4">
                  {instructions.map((text) => (
                    <Button
                      key={text}
                      variant={selectedInstructions.has(text) ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => toggleInstruction(text)}
                      className={cn(
                        "rounded-full transition-all text-[10px] md:text-xs px-2 md:px-3 h-6 md:h-8",
                        selectedInstructions.has(text) ? "opacity-80" : "opacity-100"
                      )}
                    >
                      {selectedInstructions.has(text) && <Check className="h-2.5 w-2.5 md:h-3 md:w-3 mr-0.5 md:mr-1" />}
                      {text}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
        
      case 6:
        return (
          <div className="max-w-xs md:max-w-4xl mx-auto mt-4 md:mt-8">
            <div className="bg-muted/20 p-3 md:p-8 rounded-lg border">
              <h3 className="text-lg md:text-2xl font-semibold mb-4 md:mb-6">Review your creation</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                <div className="space-y-4 md:space-y-6">
                  <div className="space-y-2 md:space-y-3">
                    <h4 className="text-sm md:text-lg font-medium">Asset Details</h4>
                    <div className="space-y-2 md:space-y-4 bg-background p-3 md:p-5 rounded-lg border">
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-muted-foreground">Type</span>
                        <Badge variant="outline" className="capitalize text-[10px] md:text-xs">{assetType}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-muted-foreground">Name</span>
                        <span className="font-medium text-xs md:text-sm text-right truncate max-w-[180px] md:max-w-[220px]">{assetName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-muted-foreground">Layout</span>
                        <Badge variant="outline" className="capitalize text-[10px] md:text-xs">{selectedLayout}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-muted-foreground">Variations</span>
                        <span className="font-medium text-xs md:text-sm">{variantCount}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 md:space-y-3">
                    <h4 className="text-sm md:text-lg font-medium">Instructions</h4>
                    <div className="p-3 md:p-5 bg-background rounded-lg border">
                      <p className="whitespace-pre-line text-xs md:text-sm">{prompt}</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4 md:space-y-6">
                  <div className="space-y-2 md:space-y-3">
                    <h4 className="text-sm md:text-lg font-medium">Images</h4>
                    <div className="grid grid-cols-2 gap-2 md:gap-4">
                      <div className="space-y-1 md:space-y-2">
                        <Label className="text-[10px] md:text-sm text-muted-foreground">Product Image</Label>
                        <div className="border rounded-lg overflow-hidden aspect-square">
                          {productImageUrl ? (
                            <LazyImage
                              src={productImageUrl}
                              alt="Product"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-1 md:space-y-2">
                        <Label className="text-[10px] md:text-sm text-muted-foreground">Reference Image</Label>
                        <div className="border rounded-lg overflow-hidden aspect-square">
                          {referenceImageUrl ? (
                            <LazyImage
                              src={referenceImageUrl}
                              alt="Reference"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <PiSmileySad className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 md:mt-8 pt-2 md:pt-4 border-t">
                    <Button 
                      onClick={handleSubmit} 
                      size="sm"
                      className="w-full py-4 md:py-6 text-sm md:text-lg h-auto"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 md:mr-3 h-4 w-4 md:h-5 md:w-5 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 md:mr-3 h-4 w-4 md:h-5 md:w-5" />
                          Create asset ({variantCount} credit{parseInt(variantCount) > 1 ? 's' : ''})
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
  
  // Get button text based on current step
  const getNextButtonText = () => {
    if (currentStep === totalSteps) {
      return isSubmitting ? "Creating..." : "Create";
    } else if (currentStep === totalSteps - 1) {
      return "Review";
    } else {
      return "Continue";
    }
  };
  
  // Determine if the next button should be disabled
  const isNextButtonDisabled = () => {
    if (currentStep === 2 && !hasProductImage) {
      return true;
    }
    
    if (currentStep === 5 && !prompt.trim()) {
      return true;
    }
    
    if (currentStep === 6 && !assetName.trim()) {
      return true;
    }
    
    return isSubmitting;
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
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
            Create New Asset
          </h1>
          
          <div className="w-10"></div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
        {/* Progress indicator */}
        <div className="mb-4 md:mb-8 max-w-4xl mx-auto">
          {renderStepIndicator()}
          
          {/* Step title and description */}
          <div className="text-center mt-4 md:mt-8 mb-4 md:mb-8">
            <h2 className="text-lg md:text-2xl font-semibold mb-1 md:mb-2">{getStepTitle()}</h2>
            <p className="text-xs md:text-base text-muted-foreground">{getStepDescription()}</p>
          </div>
        </div>
        
        {/* Main content area */}
        <div className="min-h-[300px] md:min-h-[400px]">
          {renderStepContent()}
        </div>
        
        {/* Navigation buttons */}
        <div className="mt-8 md:mt-16 max-w-4xl mx-auto flex items-center justify-between pt-4 md:pt-8 border-t">
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
              disabled={isNextButtonDisabled()}
            >
              {getNextButtonText()}
              <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </Button>
          )}
        </div>
      </main>
      
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
        title="Reference Image"
      />
    </div>
  );
}