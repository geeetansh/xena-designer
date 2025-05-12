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
import { Download, FileJson, Eye, Image, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useGlobalStore } from '@/lib/store';
import { LazyImage } from './LazyImage';
import { FixedSizeGrid } from 'react-window';
import throttle from 'lodash.throttle';

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
  const { toast } = useToast();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<FixedSizeGrid>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dataFetchedRef = useRef(false);

  // Get asset counts from the global store
  const { incrementGalleryRefreshTrigger } = useGlobalStore();

  // Cache page size (images per request) for consistency
  const PAGE_SIZE = 20;

  // Measure available container width for grid
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    // Function to measure container width
    const updateContainerWidth = throttle(() => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    }, 200);

    // Initial measurement
    updateContainerWidth();

    // Update on resize
    window.addEventListener('resize', updateContainerWidth);
    return () => {
      window.removeEventListener('resize', updateContainerWidth);
    };
  }, []);

  // Calculate cell size based on container width and columns
  const calculateCellSize = () => {
    const columnCount = columns === 2 ? 2 : 
                         (containerWidth < 640 ? 1 : 
                          containerWidth < 768 ? 2 :
                          containerWidth < 1024 ? 3 : 4);
    
    // Account for gap (16px between items)
    const gap = 16;
    const availableWidth = containerWidth - (gap * (columnCount - 1));
    const cellWidth = Math.floor(availableWidth / columnCount);
    
    return {
      width: cellWidth,
      height: cellWidth, // Square cells
      columnCount
    };
  };

  const cellSize = calculateCellSize();

  // Modified to use pagination with a smaller batch size (20 per page)
  const loadImages = async (page = 1, append = false) => {
    try {
      // Only show loading state if there are no images yet or loading more
      if ((images.length === 0 && !append) || (append && page > 1)) {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setLoading(true);
        }
      }
      
      // Limit to 20 items per page
      const { images: fetchedImages, totalCount: total, hasMore: more } = await fetchGeneratedImages(PAGE_SIZE, page);
      
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
      toast({
        title: "Failed to load images",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
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

  // Handle loading more images when scrolling
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMore, isLoadingMore, loadMoreRef.current]);

  // Handle loading more images
  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadImages(currentPage + 1, true);
    }
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
      
      // Update global asset counts
      incrementGalleryRefreshTrigger();
      window.dispatchEvent(new CustomEvent('galleryUpdated'));
      
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

  const confirmDelete = (image: GeneratedImage, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent image selection when clicking delete
    setImageToDelete(image);
    setIsDeleteDialogOpen(true);
  };

  // Cell renderer for the virtualized grid
  const Cell = ({ columnIndex, rowIndex, style }: { columnIndex: number; rowIndex: number; style: React.CSSProperties }) => {
    const index = rowIndex * cellSize.columnCount + columnIndex;
    if (index >= images.length) return null;
    
    const image = images[index];
    
    return (
      <div style={style} className="p-2">
        <div className="relative group overflow-hidden rounded-lg shadow-sm transition-all duration-200 hover:shadow-md h-full">
          <div className="aspect-square w-full h-full bg-background">
            <LazyImage
              src={image.url} 
              alt={image.prompt}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
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
                  onClick={(e) => confirmDelete(image, e)}
                >
                  <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

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

  if (images.length === 0 && !loading) {
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
      
      {/* Grid container with ref for measuring width */}
      <div ref={containerRef} className="w-full">
        {/* Virtualized grid for better performance */}
        <FixedSizeGrid
          ref={gridRef}
          columnCount={cellSize.columnCount}
          columnWidth={cellSize.width}
          height={Math.min(800, Math.ceil(images.length / cellSize.columnCount) * cellSize.height)}
          rowCount={Math.ceil(images.length / cellSize.columnCount)}
          rowHeight={cellSize.height}
          width={containerWidth}
          overscanRowCount={2}
        >
          {Cell}
        </FixedSizeGrid>
      </div>
      
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
                
                {selectedImage.reference_images.length > 0 && (
                  <div className="space-y-2 md:space-y-3">
                    <h3 className="font-medium text-sm md:text-base">Reference Images</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedImage.reference_images.map((refImage) => {
                        return (
                          <div key={refImage.id} className="aspect-square border rounded-md overflow-hidden">
                            <LazyImage
                              src={refImage.url} 
                              alt="Reference"
                              className="object-cover w-full h-full"
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
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(selectedImage, e);
                }}
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