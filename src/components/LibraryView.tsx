import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { FileUpload } from '@/components/FileUpload';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ImageIcon, UploadCloud, Trash2, Download, Info } from 'lucide-react';
import { fetchAssets, uploadFromBuffer, deleteAsset, Asset } from '@/services/AssetsService';
import { getCdnUrl } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
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

// Convert Asset to LibraryImage interface for compatibility with existing code
interface LibraryImage {
  id: string;
  url: string;
  filename?: string;
  content_type?: string;
  size?: number;
  created_at: string;
}

interface LibraryViewProps {
  onLibraryUpdated?: () => void;
}

export function LibraryView({ onLibraryUpdated }: LibraryViewProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<LibraryImage | null>(null);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<LibraryImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [activeTab, setActiveTab] = useState('gallery');
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Only load images when gallery tab is active
  useEffect(() => {
    if (activeTab === 'gallery') {
      loadImages(1, false);
    }
  }, [activeTab]);

  useEffect(() => {
    // Set up intersection observer for infinite scrolling
    if (!loadMoreRef.current || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, images]);

  const loadImages = async (pageNum: number, append: boolean = false) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      // Use the assets service to fetch library images
      const { assets, totalCount: total, hasMore: moreAvailable } = await fetchAssets({
        source: 'library',
        limit: 24,
        page: pageNum
      });
      
      // Convert assets to the expected LibraryImage format
      const libraryImages: LibraryImage[] = assets.map(asset => ({
        id: asset.id,
        url: asset.original_url,
        filename: asset.filename || undefined,
        content_type: asset.content_type || undefined,
        size: asset.size || undefined,
        created_at: asset.created_at
      }));
      
      if (append) {
        setImages(prev => [...prev, ...libraryImages]);
      } else {
        setImages(libraryImages);
      }
      
      setHasMore(moreAvailable);
      setTotalCount(total);
      setPage(pageNum);
    } catch (error) {
      console.error('Error fetching library images:', error);
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

  const loadMore = () => {
    if (hasMore && !loadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadImages(nextPage, true);
    }
  };

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    
    setUploading(true);
    
    try {
      // Upload each file using the new AssetsService
      const uploadPromises = selectedFiles.map(file => 
        uploadFromBuffer(file, {
          source: 'library',
          filename: file.name,
          content_type: file.type,
          size: file.size
        })
      );
      await Promise.all(uploadPromises);
      
      // Reset form
      setSelectedFiles([]);
      
      // Reload images
      await loadImages(1, false);
      
      // Notify parent component
      if (onLibraryUpdated) {
        onLibraryUpdated();
      }
      
      toast({
        title: "Upload successful",
        description: `${selectedFiles.length} image${selectedFiles.length !== 1 ? 's' : ''} uploaded successfully.`
      });
    } catch (error) {
      console.error('Error uploading images:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadImage = async (image: LibraryImage) => {
    try {
      // Use the original image URL for download
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = image.filename || `library-image-${image.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
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

  const confirmDelete = (image: LibraryImage) => {
    setImageToDelete(image);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteImage = async () => {
    if (!imageToDelete) return;
    
    setIsDeleting(true);
    try {
      // Use the deleteAsset function from AssetsService
      await deleteAsset(imageToDelete.id);
      
      // Close the dialogs
      setIsDeleteDialogOpen(false);
      if (selectedImage?.id === imageToDelete.id) {
        setIsImageViewerOpen(false);
        setSelectedImage(null);
      }
      
      // Remove the image from the local state
      setImages(images.filter(img => img.id !== imageToDelete.id));
      setTotalCount(prev => prev - 1);
      
      // Notify parent
      if (onLibraryUpdated) {
        onLibraryUpdated();
      }
      
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

  const viewImage = (image: LibraryImage) => {
    setSelectedImage(image);
    setIsImageViewerOpen(true);
  };

  if (loading && images.length === 0 && activeTab === 'gallery') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-4">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="aspect-square rounded-lg shadow-sm">
              <Skeleton className="w-full h-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-8">
      <Tabs defaultValue="gallery" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 h-9">
          <TabsTrigger value="gallery" className="text-xs md:text-sm">Gallery</TabsTrigger>
          <TabsTrigger value="upload" className="text-xs md:text-sm">Upload</TabsTrigger>
        </TabsList>
        
        <TabsContent value="gallery" className="space-y-4 md:space-y-6">
          {images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 md:h-64 text-center">
              <ImageIcon className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-3 md:mb-4" />
              <h3 className="text-base md:text-lg font-medium">No images in your library</h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 mb-3 md:mb-4">
                Upload reference images to use them in your designs
              </p>
              <Button variant="outline" onClick={() => setActiveTab('upload')} size="sm" className="text-xs md:text-sm">
                <UploadCloud className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                Upload Images
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-3 md:mb-4">
                <h2 className="text-base md:text-lg font-medium">Your Library ({totalCount})</h2>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-4">
                {images.map((image) => {
                  // Convert to CDN URL
                  const cdnUrl = getCdnUrl(image.url);
                  
                  return (
                    <div 
                      key={image.id} 
                      className="relative group overflow-hidden rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
                    >
                      <div className="aspect-square w-full h-full bg-background">
                        <img
                          src={cdnUrl} 
                          alt={image.filename || "Library image"}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end">
                        <div className="p-2 md:p-4 space-y-1">
                          <h3 className="text-white font-medium text-xs md:text-sm line-clamp-1">
                            {image.filename || "Library image"}
                          </h3>
                          <div className="flex justify-between mt-1 md:mt-2">
                            <Button 
                              size="sm" 
                              variant="secondary"
                              className="rounded-full shadow-lg text-xs h-7 px-2 md:h-8 md:px-3"
                              onClick={() => viewImage(image)}
                            >
                              <Info className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                              View
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              className="rounded-full shadow-lg h-7 w-7 p-0 md:h-8 md:w-8"
                              onClick={() => confirmDelete(image)}
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
              
              {/* Loading more indicator and load more button */}
              {hasMore && (
                <div className="mt-6 md:mt-8 flex flex-col items-center" ref={loadMoreRef}>
                  {loadingMore ? (
                    <div className="flex items-center">
                      <Loader2 className="h-5 w-5 md:h-6 md:w-6 animate-spin mr-2" />
                      <p className="text-xs md:text-sm">Loading more images...</p>
                    </div>
                  ) : (
                    <Button onClick={loadMore} variant="outline" size="sm" className="text-xs md:text-sm">
                      Load More Images
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>
        
        <TabsContent value="upload" className="space-y-4 md:space-y-6">
          <div className="space-y-4">
            <div className="bg-muted/30 p-3 md:p-4 rounded-lg">
              <h3 className="text-base md:text-lg font-medium mb-1 md:mb-2">Upload Reference Images</h3>
              <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
                Upload high-quality images to use as references for your AI image generation.
                Supported formats: JPG, PNG, JPEG, WEBP.
              </p>
              
              <div className="border rounded-lg p-4 md:p-8 bg-background">
                <FileUpload
                  onFilesSelected={handleFilesSelected}
                  selectedFiles={selectedFiles}
                  maxFiles={10}
                  uploadType="Reference Images"
                />
                
                <div className="mt-4 md:mt-6 flex justify-end">
                  <Button
                    onClick={handleUpload}
                    disabled={selectedFiles.length === 0 || uploading}
                    size="sm"
                    className="h-8 md:h-10 text-xs md:text-sm"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                        Upload {selectedFiles.length > 0 ? `${selectedFiles.length} image${selectedFiles.length !== 1 ? 's' : ''}` : ''}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Image Viewer Dialog */}
      <Dialog open={isImageViewerOpen} onOpenChange={setIsImageViewerOpen}>
        {selectedImage && (
          <DialogContent className="max-w-md md:max-w-4xl sm:max-w-[60%] p-4 md:p-6">
            <DialogHeader>
              <DialogTitle className="text-base md:text-xl">Image Details</DialogTitle>
              <DialogDescription className="text-xs md:text-sm">
                View and manage your library image
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 py-2 md:py-4">
              {/* Left side - Image */}
              <div className="space-y-3 md:space-y-4">
                <div className="rounded-lg overflow-hidden bg-neutral-50 dark:bg-neutral-900 border">
                  <div className="relative aspect-square">
                    <img 
                      src={getCdnUrl(selectedImage.url)} 
                      alt={selectedImage.filename || "Library image"}
                      className="object-contain w-full h-full"
                      loading="lazy"
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    className="flex-1 gap-1 h-8 md:h-10 text-xs md:text-sm"
                    onClick={() => handleDownloadImage(selectedImage)}
                  >
                    <Download className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                    Download
                  </Button>
                  
                  <Button 
                    variant="destructive" 
                    className="flex-1 gap-1 h-8 md:h-10 text-xs md:text-sm"
                    onClick={() => confirmDelete(selectedImage)}
                  >
                    <Trash2 className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
              
              {/* Right side - Details */}
              <div className="space-y-4 md:space-y-6">
                <div className="space-y-2">
                  <h3 className="font-medium text-sm md:text-lg">Image Information</h3>
                  <div className="border rounded-md p-3 md:p-4 space-y-2 md:space-y-3 text-xs md:text-sm">
                    {selectedImage.filename && (
                      <div>
                        <h4 className="text-xs md:text-sm font-medium text-muted-foreground">Filename</h4>
                        <p className="text-xs md:text-sm break-all">{selectedImage.filename}</p>
                      </div>
                    )}
                    
                    <div>
                      <h4 className="text-xs md:text-sm font-medium text-muted-foreground">Type</h4>
                      <p className="text-xs md:text-sm">{selectedImage.content_type || "Image"}</p>
                    </div>
                    
                    <div>
                      <h4 className="text-xs md:text-sm font-medium text-muted-foreground">Uploaded</h4>
                      <p className="text-xs md:text-sm">
                        {new Date(selectedImage.created_at).toLocaleString()}
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="text-xs md:text-sm font-medium text-muted-foreground">Size</h4>
                      <p className="text-xs md:text-sm">
                        {selectedImage.size ? `${(selectedImage.size / 1024 / 1024).toFixed(2)} MB` : "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2 hidden md:block">
                  <h3 className="font-medium text-sm md:text-lg">Usage</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    This image can be used as a reference for AI-generated content.
                    Download it to use in your image generation workflow or keep it in your library for future use.
                  </p>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm" className="h-8 md:h-10 text-xs md:text-sm">
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
              This action cannot be undone. This will permanently delete the image from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel 
              disabled={isDeleting}
              className="h-8 md:h-10 text-xs md:text-sm"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteImage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 md:h-10 text-xs md:text-sm"
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
    </div>
  );
}