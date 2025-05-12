import { useState, useEffect, useCallback } from 'react';
import { FileUpload } from './FileUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Plus, ImageIcon, FolderOpen } from 'lucide-react';
import { FaRegSquare } from "react-icons/fa";
import { LuRectangleHorizontal, LuRectangleVertical } from "react-icons/lu";
import { MdOutlineAutoAwesome } from "react-icons/md";
import { 
  uploadImageFile,
  generateImage,
  saveGeneratedImage,
  ensureStorageBucket,
  checkUserCredits,
  getUserCredits,
  deductUserCredit
} from '@/services/imageService';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { log, error as logError } from '@/lib/logger';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { ImageSelectionModal } from './ImageSelectionModal';
import { useNavigate } from 'react-router-dom';
import { useGlobalStore } from '@/lib/store';
import debounce from 'lodash.debounce';

interface GenerationFormProps {
  onImageGenerated: () => void;
}

export function GenerationForm({ onImageGenerated }: GenerationFormProps) {
  // State for selected images
  const [productImage, setProductImage] = useState<File[]>([]);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<File[]>([]);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  
  // Modal states
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isReferenceModalOpen, setIsReferenceModalOpen] = useState(false);
  
  // Form state
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [noCreditsWarning, setNoCreditsWarning] = useState(false);
  const [variantCount, setVariantCount] = useState('1');
  const [selectedLayout, setSelectedLayout] = useState('auto');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Get credit info from the global store
  const { creditInfo, fetchCreditInfo } = useGlobalStore();
  const { credits } = creditInfo;

  // Load user credits on component mount
  useEffect(() => {
    fetchCreditInfo();
  }, []);

  // Watch for credit changes via the global store
  useEffect(() => {
    setNoCreditsWarning(credits <= 0);
  }, [credits]);

  // Debounced function to handle generation status updates
  const updateGenerationProgress = useCallback(
    debounce((batchId: string) => {
      const checkProgress = async () => {
        try {
          // Use RPC function to get batch status
          const { data, error } = await supabase.rpc('get_batch_generation_status', {
            batch_id_param: batchId
          });
          
          if (error) throw error;
          
          if (data) {
            const { total, completed, failed, pending, processing } = data;
            const progress = ((completed + failed) / total) * 100;
            
            setGenerationProgress(progress);
            
            // If not complete, check again
            if (completed + failed < total) {
              setTimeout(() => updateGenerationProgress(batchId), 2000);
            } else {
              // Set to 100% when complete
              setGenerationProgress(100);
              setTimeout(() => {
                setIsGenerating(false);
                setGenerationProgress(0);
              }, 1000);
            }
          }
        } catch (error) {
          console.error('Error checking generation status:', error);
        }
      };
      
      checkProgress();
    }, 500),
    []
  );

  // Handle image generation
  const handleGeneration = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setGenerationProgress(0);
    
    log(`Starting generation process for ${variantCount} variants`);
    
    try {
      // Ensure the storage bucket exists
      await ensureStorageBucket();
      
      // Prepare all reference files and URLs
      const referenceFiles: File[] = [...productImage, ...referenceImage, ...additionalImages];
      const referenceUrls: string[] = [];
      
      // If we have direct URLs, add them
      if (productImageUrl) referenceUrls.push(productImageUrl);
      if (referenceImageUrl) referenceUrls.push(referenceImageUrl);
      
      log(`Reference files: ${referenceFiles.length}, URLs: ${referenceUrls.length}`);
      
      // Upload any direct files
      if (referenceFiles.length > 0) {
        log(`Uploading ${referenceFiles.length} files`);
        const uploadStart = Date.now();
        
        const uploadPromises = referenceFiles.map(file => uploadImageFile(file));
        const uploadedUrls = await Promise.all(uploadPromises);
        referenceUrls.push(...uploadedUrls);
        log(`All files uploaded successfully. Total reference URLs: ${referenceUrls.length}`);
      }
      
      // Get the number of variants
      const variants = parseInt(variantCount, 10);
      log(`Generating ${variants} variant(s) with prompt: ${prompt}, size: ${selectedLayout}`);
      
      // Call onImageGenerated to trigger notification immediately
      log('Triggering onImageGenerated callback for immediate notification');
      onImageGenerated();
      
      // Show progress of 10% after starting
      setGenerationProgress(10);
      
      // Generate images using our consolidated function
      log(`Calling generateImage with ${variants} variants`);
      const generationStart = Date.now();
      
      const result = await generateImage(referenceFiles, prompt, referenceUrls, variants, selectedLayout);
      
      log(`Generation result received in ${((Date.now() - generationStart) / 1000).toFixed(1)}s`);
      
      // Set progress to 60% after API call completes
      setGenerationProgress(60);
      
      // Log the results
      log(`Generated ${result.urls.length} images with variation group ID: ${result.variationGroupId}`);
      
      // Start tracking progress
      updateGenerationProgress(result.variationGroupId);
      
      // Save all images to the database
      for (let i = 0; i < result.urls.length; i++) {
        try {
          await saveGeneratedImage(result.urls[i], prompt, referenceUrls, {
            ...result.rawJson,
            variation_index: i,
            variation_group_id: result.variationGroupId
          });
          
          // Update progress incrementally for each image saved
          setGenerationProgress(60 + Math.floor((i+1) / result.urls.length * 40));
        } catch (error) {
          logError(`Error saving image ${i+1}: ${error}`);
        }
      }
      
      // Update credits display (already deducted by API)
      await fetchCreditInfo();
      
      // Reset form
      setProductImage([]);
      setProductImageUrl(null);
      setReferenceImage([]);
      setReferenceImageUrl(null);
      setAdditionalImages([]);
      setPrompt('');
      setGenerationProgress(100);
      
      // Delay setting isGenerating to false to allow progress bar to complete
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationProgress(0);
      }, 1000);
      
    } catch (error) {
      logError(`Error generating image:`, error);
      
      // Extract and display a user-friendly error message
      let userErrorMessage = "An unexpected error occurred";
      if (error instanceof Error) {
        // Customize error messages based on their content
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
          userErrorMessage = "The request timed out. Try with fewer images or a simpler prompt.";
        } else if (error.message.includes('OpenAI')) {
          userErrorMessage = `OpenAI error: ${error.message.replace('OpenAI error: ', '')}`;
        } else if (error.message.includes('credit')) {
          userErrorMessage = error.message;
        } else {
          userErrorMessage = error.message;
        }
      }
      
      setErrorMessage(userErrorMessage);
      
      toast({
        title: "Generation failed",
        description: userErrorMessage,
        variant: "destructive"
      });
      
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    log('Form submitted, validating inputs');
    
    // Check if we have at least one image
    const hasProductImage = productImage.length > 0 || productImageUrl !== null;
    const hasReferenceImage = referenceImage.length > 0 || referenceImageUrl !== null;
    
    if (!hasProductImage && !hasReferenceImage && additionalImages.length === 0) {
      toast({
        title: "No images provided",
        description: "Please add at least one image",
        variant: "destructive"
      });
      return;
    }
    
    if (!prompt.trim()) {
      toast({
        title: "No prompt provided",
        description: "Please enter a prompt to guide the image generation",
        variant: "destructive"
      });
      return;
    }
    
    // Check if user has credits before proceeding
    try {
      const variantsCount = parseInt(variantCount, 10);
      log(`Checking if user has ${variantsCount} credits available`);
      const { hasCredits, credits: currentCredits } = await checkUserCredits();
      
      if (!hasCredits || currentCredits < variantsCount) {
        setNoCreditsWarning(true);
        toast({
          title: "Insufficient credits",
          description: `You need ${variantsCount} credits for this generation but only have ${currentCredits} available.`,
          variant: "destructive"
        });
        return;
      }
      
      log(`User has ${currentCredits} credits, proceeding with generation`);
    } catch (err) {
      logError('Error checking user credits:', err);
      toast({
        title: "Couldn't verify credits",
        description: "There was an issue checking your available credits.",
        variant: "destructive"
      });
      return;
    }
    
    // Generate the image(s)
    log('Starting image generation process');
    await handleGeneration();
  };
  
  // Handle product image selection from modal
  const handleProductImageSelected = (file: File | null, url: string | null) => {
    log(`Product image selected: ${file ? 'File' : 'URL'}`);
    if (file) {
      setProductImage([file]);
      setProductImageUrl(null);
    } else if (url) {
      setProductImage([]);
      setProductImageUrl(url);
    }
  };
  
  // Handle reference image selection from modal
  const handleReferenceImageSelected = (file: File | null, url: string | null) => {
    log(`Reference image selected: ${file ? 'File' : 'URL'}`);
    if (file) {
      setReferenceImage([file]);
      setReferenceImageUrl(null);
    } else if (url) {
      setReferenceImage([]);
      setReferenceImageUrl(url);
    }
  };
  
  // Determine if product image is selected
  const hasProductImage = productImage.length > 0 || productImageUrl !== null;
  
  // Determine if reference image is selected
  const hasReferenceImage = referenceImage.length > 0 || referenceImageUrl !== null;

  return (
    <div className="w-full space-y-6">
      {noCreditsWarning && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No credits available</AlertTitle>
          <AlertDescription>
            You've used all your available credits. Please upgrade your plan to generate more images.
          </AlertDescription>
        </Alert>
      )}
      
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Generation Error</AlertTitle>
          <AlertDescription>
            {errorMessage}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Show progress for generation */}
      {isGenerating && generationProgress > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span>Generating images...</span>
            <span>{Math.floor(generationProgress)}%</span>
          </div>
          <Progress value={generationProgress} className="h-3 bg-background/80" />
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Glassy prompt input */}
        <div className="bg-gradient-to-r from-background/80 to-background/40 backdrop-blur-sm border border-border/40 rounded-2xl p-5 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="prompt" className="text-sm font-medium text-muted-foreground">Describe what you want Xena to do...</Label>
            <Input
              id="prompt"
              placeholder="Enter your prompt here..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-transparent border-none shadow-none text-base focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            />
          </div>
        </div>
        
        <div className="space-y-6 mt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Upload Images</h3>
            
            <div className="flex items-center gap-3">
              {/* Layout selection */}
              <div>
                <Label className="sr-only">Layout</Label>
                <div className="flex gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={selectedLayout === "square" ? "default" : "outline"}
                          className="h-10 w-10 p-0"
                          onClick={() => setSelectedLayout("square")}
                          type="button"
                        >
                          <FaRegSquare className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Square (1:1)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={selectedLayout === "landscape" ? "default" : "outline"}
                          className="h-10 w-10 p-0"
                          onClick={() => setSelectedLayout("landscape")}
                          type="button"
                        >
                          <LuRectangleHorizontal className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Landscape (3:2)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={selectedLayout === "portrait" ? "default" : "outline"}
                          className="h-10 w-10 p-0"
                          onClick={() => setSelectedLayout("portrait")}
                          type="button"
                        >
                          <LuRectangleVertical className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Portrait (2:3)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={selectedLayout === "auto" ? "default" : "outline"}
                          className="h-10 w-10 p-0"
                          onClick={() => setSelectedLayout("auto")}
                          type="button"
                        >
                          <MdOutlineAutoAwesome className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Auto (Best Fit)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Label htmlFor="variants" className="text-sm text-muted-foreground">
                  Generate variants:
                </Label>
                <Select 
                  value={variantCount} 
                  onValueChange={setVariantCount}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue placeholder="1" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Product Image Selection Button */}
            <div className="space-y-2">
              <div className="flex items-baseline mb-2">
                <p className="text-sm font-medium">Product Image <span className="text-destructive">*</span></p>
              </div>
              
              {hasProductImage ? (
                <div className="relative group border rounded-lg p-4 h-48">
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="relative w-full h-full">
                      <img 
                        src={productImageUrl || (productImage.length > 0 ? URL.createObjectURL(productImage[0]) : '')} 
                        alt="Product" 
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => setIsProductModalOpen(true)}
                          className="mr-2"
                          type="button"
                        >
                          Change
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => {
                            setProductImage([]);
                            setProductImageUrl(null);
                          }}
                          type="button"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-48 flex flex-col gap-2"
                  onClick={() => setIsProductModalOpen(true)}
                  type="button"
                >
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <span>Select Product Image</span>
                </Button>
              )}
            </div>
            
            {/* Reference Image Selection Button */}
            <div className="space-y-2">
              <div className="flex items-baseline mb-2">
                <p className="text-sm font-medium">Reference Image <span className="text-destructive">*</span></p>
              </div>
              
              {hasReferenceImage ? (
                <div className="relative group border rounded-lg p-4 h-48">
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="relative w-full h-full">
                      <img 
                        src={referenceImageUrl || (referenceImage.length > 0 ? URL.createObjectURL(referenceImage[0]) : '')} 
                        alt="Reference" 
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => setIsReferenceModalOpen(true)}
                          className="mr-2"
                          type="button"
                        >
                          Change
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => {
                            setReferenceImage([]);
                            setReferenceImageUrl(null);
                          }}
                          type="button"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-48 flex flex-col gap-2"
                  onClick={() => setIsReferenceModalOpen(true)}
                  type="button"
                >
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <span>Select Reference Image</span>
                </Button>
              )}
            </div>
            
            {/* Additional Images Upload - Up to 2 images */}
            <FileUpload
              onFilesSelected={setAdditionalImages}
              selectedFiles={additionalImages}
              maxFiles={2}
              uploadType="Additional Images (0/2)"
            />
          </div>
        </div>
        
        <div className="flex flex-col gap-2">
          <Button 
            type="submit" 
            className="w-full"
            disabled={
              (!hasProductImage && !hasReferenceImage && additionalImages.length === 0) || 
              !prompt.trim() ||
              noCreditsWarning ||
              isGenerating
            }
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : parseInt(variantCount) > 1 ? (
              <>
                Generate {variantCount} Variants ({variantCount} credits)
              </>
            ) : (
              'Generate Ad With Images'
            )}
          </Button>
          
          {/* Credit info */}
          <p className="text-xs text-center text-muted-foreground">
            You have {credits !== null ? credits : '...'} credits remaining. 
            Each image variant costs 1 credit.
          </p>
        </div>
      </form>
      
      {/* Product Image Selection Modal */}
      <ImageSelectionModal
        open={isProductModalOpen}
        onOpenChange={setIsProductModalOpen}
        onImageSelected={handleProductImageSelected} 
        title="Product Image"
        isProduct={true}
      />
      
      {/* Reference Image Selection Modal */}
      <ImageSelectionModal
        open={isReferenceModalOpen}
        onOpenChange={setIsReferenceModalOpen}
        onImageSelected={handleReferenceImageSelected} 
        title="Reference Image"
      />
    </div>
  );
}