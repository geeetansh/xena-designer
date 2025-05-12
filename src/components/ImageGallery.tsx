import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  fetchGeneratedImages, 
  GeneratedImage,
  deleteGeneratedImage
} from '@/services/imageService';
import { Card, CardContent } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
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
import { Button } from '@/components/ui/button';
import { Download, FileJson, Eye, Image, Loader2, RefreshCcw, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface ImageGalleryProps {
  refreshTrigger: number;
  columns?: number;
}

export function ImageGallery({ refreshTrigger, columns = 4 }: ImageGalleryProps) {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<GeneratedImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const { toast } = useToast();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const dataFetchedRef = useRef(false);

  // Modified to use pagination with a smaller batch size (10 per page)
  // Includes better error handling and timeout recovery
  const loadImages = async (page = 1, append = false) => {
    try {
      setError(null);
      
      // Only show loading state if there are no images yet or loading more
      if ((images.length === 0 && !append) || (append && page > 1)) {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setLoading(true);
        }
      }
      
      // Limit to 10 items per page (reduced from 20 to prevent timeouts)
      const { images: fetchedImages, totalCount: total, hasMore: more } = await fetchGeneratedImages(10, page);
      
      if (append) {
        setImages(prevImages => [...prevImages, ...fetchedImages]);
      } else {
        setImages(fetchedImages);
      }
      
      setTotalCount(total);
      setHasMore(more);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching images:', error);
      setError(error instanceof Error ? error.message : "An unexpected error occurred");
      
      toast({
        title: "Failed to load images",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
      setRetrying(false);
      dataFetchedRef.current = true;
    }
  };

  // Only check session once on initial load
  useEffect(() => {
    // Don't fetch data again if not necessary
    if (!dataFetchedRef.current || refreshTrigger > 0) {
      // Reset to page 1 when refreshing
      loadImages(1, false);
    }
  }, [refreshTrigger]);

  // Handle loading more images
  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadImages(currentPage + 1, true);
    }
  };

  // Retry loading images if there was an error
  const handleRetry = () => {
    setRetrying(true);
    loadImages(currentPage, false);
  };

  const handleDownloadImage = async (imageUrl: string, prompt: string) => {
    try {
      // Always download the original image, not the optimized version
      
      // For data URLs (base64 images)
      if (imageUrl.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `iconic-${prompt.substring(0, 20).replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } 
      // For regular URLs
      else {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `iconic-${prompt.substring(0, 20).replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
      
      toast({
        title: "Image downloaded",
        description: "The image has been downloaded successfully"
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
        description: "The image has been permanently deleted"
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

  // Memoize the image rendering to prevent unnecessary re-renders
  const imageGallery = useMemo(() => (
    <div className={`grid grid-cols-${columns === 2 ? '2' : '1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'} gap-2 md:gap-4`}>
      {images.map((image) => {
        return (
          <div 
            key={image.id} 
            className="relative group overflow-hidden rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
          >
            <div className="aspect-square w-full h-full bg-background">
              <img
                src={image.url} 
                alt={image.prompt}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end">
              <div className="p-2 md:p-4 space-y-1">
                <h3 className="text-white font-medium text-xs md:text-sm line-clamp-1">{image.prompt}</h3>
                <div className="flex justify-between mt-1 md:mt-2">
                  <Button 
                    size="sm" 
                    variant="secondary"
                    className="rounded-full shadow-lg text-xs h-7 px-2 md:h-8 md:px-3"
                    onClick={() => setSelectedImage(image)}
                  >
                    <Eye className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                    View
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    className="rounded-full shadow-lg h-7 w-7 p-0 md:h-8 md:w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmDelete(image);
                    }}
                  >
                    <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ), [images, columns]);

  if (loading && images.length === 0) {
    return (
      <div className="space-y-4">
        <div className={`grid grid-cols-${columns === 2 ? '2' : '1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'} gap-2 md:gap-4`}>
          {[...Array(8)].map((_, index) => (
            <div key={index} className="aspect-square rounded-lg shadow-sm">
              <Skeleton className="w-full h-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 md:h-64 text-center p-4 border border-red-200 bg-red-50 rounded-lg">
        <div className="text-red-500 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h3 className="text-base md:text-lg font-medium text-red-700">Failed to load images</h3>
        <p className="text-xs md:text-sm text-red-600 mt-2 mb-4">
          {error}
        </p>
        <Button 
          onClick={handleRetry} 
          variant="outline" 
          size="sm"
          className="text-xs md:text-sm"
          disabled={retrying}
        >
          {retrying ? (
            <>
              <Loader2 className="h-3 w-3 md:h-4 md:w-4 mr-2 animate-spin" />
              Retrying...
            </>
          ) : (
            <>
              <RefreshCcw className="h-3 w-3 md:h-4 md:w-4 mr-2" />
              Retry
            </>
          )}
        </Button>
      </div>
    );
  }

  if (images.length === 0 && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 md:h-64 text-center">
        <Image className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-3 md:mb-4" />
        <h3 className="text-base md:text-lg font-medium">No images yet</h3>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Upload reference images and generate your first AI image
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 md:mb-4">
        <h2 className="text-base md:text-lg font-medium">Your Images ({totalCount})</h2>
      </div>
      
      {/* Show error banner if there was an error but we have some images */}
      {error && images.length > 0 && (
        <div className="mb-4 p-3 border border-amber-200 bg-amber-50 rounded-lg flex items-center justify-between">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-amber-500 mr-2" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span className="text-xs md:text-sm text-amber-800">{error}</span>
          </div>
          <Button 
            onClick={handleRetry} 
            variant="outline" 
            size="sm"
            className="text-xs border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200"
            disabled={retrying}
          >
            {retrying ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Retrying
              </>
            ) : (
              <>
                <RefreshCcw className="h-3 w-3 mr-1" />
                Retry
              </>
            )}
          </Button>
        </div>
      )}
      
      {/* Use memoized gallery to prevent unnecessary re-renders */}
      {imageGallery}
      
      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center mt-6 md:mt-8 mb-4" ref={loadMoreRef}>
          <Button 
            onClick={handleLoadMore} 
            disabled={isLoadingMore}
            variant="outline"
            size="sm"
            className="w-full text-xs md:text-sm md:max-w-xs h-8 md:h-10"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-3 w-3 md:h-4 md:w-4 mr-2 animate-spin" />
                Loading more...
              </>
            ) : (
              <>
                Load More Images
              </>
            )}
          </Button>
        </div>
      )}
      
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        {selectedImage && (
          <DialogContent className="max-w-4xl md:max-w-5xl p-4 md:p-6">
            <DialogHeader>
              <DialogTitle className="text-base md:text-lg">Generated image overview</DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 py-2 md:py-4">
              {/* Left side - Image */}
              <div className="space-y-3 md:space-y-4">
                <div className="rounded-lg overflow-hidden">
                  <img 
                    src={selectedImage.url} 
                    alt={selectedImage.prompt}
                    className="object-contain w-full h-full"
                    loading="lazy"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    className="flex-1 text-xs h-8 md:h-10"
                    onClick={() => handleDownloadImage(selectedImage.url, selectedImage.prompt)}
                  >
                    <Download className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                    Download
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="flex-1 text-xs h-8 md:h-10"
                    onClick={() => {
                      // Close the current dialog
                      setSelectedImage(null);
                      
                      // Dispatch a custom event that App.tsx can listen for
                      const event = new CustomEvent('viewImageJson', { 
                        detail: { imageId: selectedImage.id } 
                      });
                      window.dispatchEvent(event);
                    }}
                  >
                    <FileJson className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                    View JSON
                  </Button>
                </div>
              </div>
              
              {/* Right side - Details */}
              <div className="space-y-4 md:space-y-6 text-sm">
                <div className="space-y-1 md:space-y-2">
                  <h3 className="font-medium text-sm md:text-base">Prompt</h3>
                  <p className="text-xs md:text-sm border rounded-md p-2 md:p-3 bg-muted/50">{selectedImage.prompt}</p>
                </div>
                
                {selectedImage.reference_images && selectedImage.reference_images.length > 0 && (
                  <div className="space-y-2 md:space-y-3">
                    <h3 className="font-medium text-sm md:text-base">Reference Images</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedImage.reference_images.map((refImage) => {
                        return (
                          <div key={refImage.id} className="aspect-square border rounded-md overflow-hidden">
                            <img 
                              src={refImage.url} 
                              alt="Reference"
                              className="object-cover w-full h-full"
                              loading="lazy"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                <div className="space-y-1 md:space-y-2">
                  <h3 className="font-medium text-sm md:text-base">Created</h3>
                  <p className="text-xs md:text-sm">
                    {new Date(selectedImage.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            
            <DialogFooter className="flex items-center justify-between sm:justify-between mt-2 md:mt-4 gap-2">
              <Button 
                variant="destructive" 
                size="sm"
                className="h-8 text-xs md:text-sm"
                onClick={() => confirmDelete(selectedImage)}
              >
                <Trash2 className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                Delete Image
              </Button>
              
              <DialogClose asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs md:text-sm">
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-xs md:max-w-md p-4 md:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base md:text-lg">Delete this image?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs md:text-sm">
              This action cannot be undone. This will permanently delete the generated image and all associated reference images and logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 md:mt-4">
            <AlertDialogCancel disabled={isDeleting} className="h-8 text-xs md:h-10 md:text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteImage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 text-xs md:h-10 md:text-sm"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
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