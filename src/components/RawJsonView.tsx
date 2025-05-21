import { useState, useEffect, useRef } from 'react';
import { GeneratedImage, fetchGeneratedImages, deleteGeneratedImage } from '@/services/imageService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog,
  DialogContent,
  DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Image, Code, Loader2, AlertTriangle, ArrowRight, SendHorizontal, DownloadCloud, LayoutList, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface RawJsonViewProps {
  refreshTrigger: number;
  selectedImageId?: string | null;
}

export function RawJsonView({ refreshTrigger, selectedImageId }: RawJsonViewProps) {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<GeneratedImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadImages = async (pageNum: number, append: boolean = false) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      // Fetch images with a reasonable limit instead of 1000 to avoid timeouts
      const { images: fetchedImages, totalCount: total, hasMore: more } = await fetchGeneratedImages(20, pageNum);
      
      if (append) {
        setImages(prevImages => [...prevImages, ...fetchedImages]);
      } else {
        setImages(fetchedImages);
      }
      
      setTotalCount(total);
      setHasMore(more);
      
      // If selectedImageId is provided, find and select that image
      if (selectedImageId) {
        const imageToSelect = fetchedImages.find(img => img.id === selectedImageId);
        if (imageToSelect) {
          setSelectedImage(imageToSelect);
        } else if (more && pageNum < 5) {
          // Try looking in the next few pages if we don't find it in the current page
          // but limit how many pages we'll check to avoid excessive requests
          loadNextPageForSelectedImage(pageNum + 1);
        }
      }
    } catch (error) {
      console.error('Error fetching images:', error);
      toast({
        title: "Failed to load images",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Helper function to look for a selected image in subsequent pages
  const loadNextPageForSelectedImage = async (pageNum: number) => {
    try {
      const { images: fetchedImages, hasMore: more } = await fetchGeneratedImages(20, pageNum);
      const imageToSelect = fetchedImages.find(img => img.id === selectedImageId);
      
      if (imageToSelect) {
        setSelectedImage(imageToSelect);
        // Add these images to the existing set
        setImages(prevImages => [...prevImages, ...fetchedImages]);
        setPage(pageNum);
      } else if (more && pageNum < 5) {
        // Continue looking in the next page
        loadNextPageForSelectedImage(pageNum + 1);
      }
    } catch (error) {
      console.error('Error searching for selected image:', error);
    }
  };

  useEffect(() => {
    // Reset to first page when refresh trigger changes
    setPage(1);
    loadImages(1, false);
  }, [refreshTrigger]);

  // Handle loading more images when needed
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      setPage(prevPage => prevPage + 1);
      loadImages(page + 1, true);
    }
  };

  // Scroll to the selected image card when it's available
  useEffect(() => {
    if (selectedImageId && selectedCardRef.current) {
      setTimeout(() => {
        selectedCardRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    }
  }, [selectedImageId, loading]);

  const handleDeleteImage = async () => {
    if (!imageToDelete) return;
    
    setIsDeleting(true);
    try {
      await deleteGeneratedImage(imageToDelete.id);
      
      // Close the dialogs
      setIsDeleteDialogOpen(false);
      if (selectedImage?.id === imageToDelete.id) {
        setSelectedImage(null);
      }
      
      // Remove the image from the local state
      setImages(images.filter(img => img.id !== imageToDelete.id));
      setTotalCount(prev => prev - 1);
      
      toast({
        title: "Image deleted",
        description: "The image and its logs have been permanently deleted"
      });
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setImageToDelete(null);
    }
  };

  const confirmDelete = (image: GeneratedImage) => {
    setImageToDelete(image);
    setIsDeleteDialogOpen(true);
  };

  if (loading && images.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, index) => (
          <Skeleton key={index} className="w-full h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (images.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Code className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No JSON data available</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Generate an image to see the OpenAI API request and response
        </p>
      </div>
    );
  }

  const parseRawJson = (jsonString: string | null | undefined) => {
    if (!jsonString) return null;
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      console.error("Error parsing JSON:", e);
      return { error: "Invalid JSON data", raw: jsonString };
    }
  };

  const hasOpenAIError = (jsonData: any) => {
    return jsonData && (jsonData.warning === "Used fallback image due to OpenAI API error" || jsonData.fallback);
  };

  const formatJsonBlock = (data: any) => {
    return (
      <div className="bg-muted rounded-md p-4 max-h-96 overflow-auto">
        <pre className="text-xs text-left whitespace-pre-wrap break-words">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  const isTextOnlyGeneration = (jsonData: any) => {
    return jsonData && 
           jsonData.input && 
           jsonData.input.userInput && 
           jsonData.input.userInput.textOnly === true;
  };

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-medium">API Response Logs ({totalCount})</h2>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {images.map((image) => {
          const jsonData = parseRawJson(image.raw_json);
          const hasError = hasOpenAIError(jsonData);
          const textOnly = isTextOnlyGeneration(jsonData);
          const isSelected = image.id === selectedImageId;
          
          return (
            <Card 
              key={image.id} 
              ref={isSelected ? selectedCardRef : null}
              className={`overflow-hidden cursor-pointer hover:shadow-md transition-shadow 
                ${isSelected ? 'ring-2 ring-primary shadow-md' : ''}
                ${hasError ? 'border-yellow-400 dark:border-yellow-600' : ''}`}
              onClick={() => setSelectedImage(image)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 shrink-0">
                    <img 
                      src={image.url} 
                      alt={image.prompt}
                      className="object-cover w-full h-full rounded"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-medium truncate">{image.prompt}</h3>
                    <div className="flex items-center gap-2">
                      {hasError && (
                        <span className="inline-flex items-center text-yellow-600 dark:text-yellow-400">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          <span className="text-xs">API Error</span>
                        </span>
                      )}
                      {textOnly && (
                        <span className="inline-flex items-center text-blue-600 dark:text-blue-400">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          <span className="text-xs">Text Only</span>
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {image.raw_json ? "JSON data available" : "No JSON data available"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(image);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Code className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center mt-6">
          <Button 
            onClick={handleLoadMore} 
            disabled={loadingMore}
            variant="outline"
            size="lg"
            className="w-full max-w-xs"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading more...
              </>
            ) : (
              <>
                Load More Logs
              </>
            )}
          </Button>
        </div>
      )}

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        {selectedImage && (() => {
          const jsonData = parseRawJson(selectedImage.raw_json);
          const hasProcessingSteps = jsonData && jsonData.processing && jsonData.processing.steps;
          const hasInput = jsonData && jsonData.input;
          const hasOutput = jsonData && jsonData.output;
          const isTextOnly = isTextOnlyGeneration(jsonData);
          
          return (
            <DialogContent className="max-w-3xl">
              <h2 className="text-lg font-semibold mb-4">OpenAI API Data</h2>
              <div className="text-sm text-muted-foreground mb-6">
                {isTextOnly 
                  ? "View the text-to-image generation details from the OpenAI API"
                  : "View the request sent to and response received from the OpenAI API"
                }
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 shrink-0">
                    <img 
                      src={selectedImage.url} 
                      alt={selectedImage.prompt}
                      className="object-cover w-full h-full rounded"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <h3 className="font-medium">Prompt</h3>
                    <p className="text-sm">{selectedImage.prompt}</p>
                    {isTextOnly && (
                      <span className="inline-flex items-center text-blue-600 dark:text-blue-400 mt-1">
                        <MessageSquare className="h-3 w-3 mr-1" />
                        <span className="text-xs">Text-only generation</span>
                      </span>
                    )}
                  </div>
                </div>
                
                {hasOpenAIError(jsonData) && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4 mb-4">
                    <div className="flex items-start">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-yellow-800 dark:text-yellow-300">OpenAI API Error</h4>
                        <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                          {jsonData.error || "Unknown error occurred"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {selectedImage.raw_json ? (
                  <Tabs defaultValue="processing" className="w-full">
                    <TabsList className="grid grid-cols-4">
                      <TabsTrigger value="processing">
                        <div className="flex items-center">
                          <LayoutList className="h-4 w-4 mr-2" />
                          Processing Steps
                        </div>
                      </TabsTrigger>
                      <TabsTrigger value="input-output">
                        <div className="flex items-center">
                          <SendHorizontal className="h-4 w-4 mr-2" />
                          Input & Output
                        </div>
                      </TabsTrigger>
                      <TabsTrigger value="input">
                        <div className="flex items-center">
                          <SendHorizontal className="h-4 w-4 mr-2" />
                          Request Input
                        </div>
                      </TabsTrigger>
                      <TabsTrigger value="output">
                        <div className="flex items-center">
                          <DownloadCloud className="h-4 w-4 mr-2" />
                          Response Output
                        </div>
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="processing" className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center">
                          <LayoutList className="h-4 w-4 mr-2" />
                          Image Processing Steps
                        </h4>
                        {hasProcessingSteps ? (
                          <div className="bg-muted rounded-md p-4">
                            <ul className="list-none space-y-2">
                              {jsonData.processing.steps.map((step: string, index: number) => (
                                <li key={index} className="text-sm flex items-start">
                                  <span className="mr-2">{step}</span>
                                </li>
                              ))}
                            </ul>
                            {jsonData.processing.error && (
                              <div className="mt-4 border-t pt-2 text-destructive text-sm">
                                <strong>Error:</strong> {jsonData.processing.error}
                                {jsonData.processing.details && (
                                  <div className="mt-1">{jsonData.processing.details}</div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-muted rounded-md p-4 text-center">
                            <p className="text-muted-foreground">No processing steps available</p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="input-output" className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium flex items-center">
                            <SendHorizontal className="h-4 w-4 mr-2" />
                            Request Input
                          </h4>
                          {hasInput ? (
                            formatJsonBlock(jsonData.input)
                          ) : (
                            <div className="bg-muted rounded-md p-4 text-center">
                              <p className="text-muted-foreground">No input data available</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium flex items-center">
                            <DownloadCloud className="h-4 w-4 mr-2" />
                            Response Output
                          </h4>
                          {hasOutput ? (
                            formatJsonBlock(jsonData.output)
                          ) : (
                            <div className="bg-muted rounded-md p-4 text-center">
                              <p className="text-muted-foreground">No output data available</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="input">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center">
                          <SendHorizontal className="h-4 w-4 mr-2" />
                          Full Request Input
                        </h4>
                        {hasInput ? (
                          formatJsonBlock(jsonData.input)
                        ) : (
                          <div className="bg-muted rounded-md p-4 text-center">
                            <p className="text-muted-foreground">No input data available</p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="output">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center">
                          <DownloadCloud className="h-4 w-4 mr-2" />
                          Full Response Output
                        </h4>
                        {hasOutput ? (
                          formatJsonBlock(jsonData.output)
                        ) : (
                          <div className="bg-muted rounded-md p-4 text-center">
                            <p className="text-muted-foreground">No output data available</p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="bg-muted rounded-md p-4 text-center">
                    <p className="text-muted-foreground">No JSON data available for this image</p>
                  </div>
                )}
                
                <div className="flex justify-between">
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => confirmDelete(selectedImage)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Log
                  </Button>
                  
                  {selectedImage.raw_json && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        navigator.clipboard.writeText(selectedImage.raw_json || '');
                        toast({
                          title: "Copied to clipboard",
                          description: "JSON data has been copied to your clipboard"
                        });
                      }}
                    >
                      Copy JSON
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          );
        })()}
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this image?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the generated image and all associated reference images and logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteImage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MessageSquare(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}