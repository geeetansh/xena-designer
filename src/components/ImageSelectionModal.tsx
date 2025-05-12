import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FileUpload } from './FileUpload';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { FolderOpen, ShoppingBag, Upload, Loader2, Check, ImageIcon, X } from 'lucide-react';
import { fetchLibraryImages, LibraryImage } from '@/services/libraryService';
import { fetchShopifyProducts, ShopifyProduct, getShopifyCredentials } from '@/services/shopifyService';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface ImageSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageSelected: (file: File | null, url: string | null) => void;
  title: string;
  isProduct?: boolean;
}

export function ImageSelectionModal({
  open,
  onOpenChange,
  onImageSelected,
  title,
  isProduct = false,
}: ImageSelectionModalProps) {
  const [selectedFile, setSelectedFile] = useState<File[]>([]);
  
  // Library and Shopify state
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [shopifyProductImages, setShopifyProductImages] = useState<{ url: string, alt: string, productTitle: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [isShopifyConnected, setIsShopifyConnected] = useState(false);
  
  const { toast } = useToast();
  const navigate = useNavigate();

  // Load all images when modal opens
  useEffect(() => {
    if (open) {
      loadAllImages();
    } else {
      // Clear selection when modal closes
      setSelectedFile([]);
      setSelectedImageUrl(null);
    }
  }, [open]);

  // Function to load all images
  const loadAllImages = async () => {
    setIsLoading(true);
    
    try {
      // Check if Shopify is connected
      const credentials = await getShopifyCredentials();
      setIsShopifyConnected(!!credentials);
      
      // Load library images
      const { images } = await fetchLibraryImages(100, 1);
      setLibraryImages(images);
      
      // Load Shopify products if connected
      if (credentials) {
        const { products } = await fetchShopifyProducts(20);
        setShopifyProducts(products);
        
        // Extract all product images
        const allProductImages = products.flatMap(product => {
          // Include featured image
          const images = [];
          if (product.featuredImage) {
            images.push({
              url: product.featuredImage.url,
              alt: product.featuredImage.altText || product.title,
              productTitle: product.title
            });
          }
          
          // Include all other images
          product.images.edges.forEach(edge => {
            // Avoid duplicating featured image
            if (product.featuredImage && edge.node.url === product.featuredImage.url) {
              return;
            }
            
            images.push({
              url: edge.node.url,
              alt: edge.node.altText || product.title,
              productTitle: product.title
            });
          });
          
          return images;
        });
        
        setShopifyProductImages(allProductImages);
      }
    } catch (error) {
      console.error('Error loading images:', error);
      toast({
        title: "Failed to load images",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle file selection
  const handleFileSelected = (files: File[]) => {
    setSelectedFile(files);
    setSelectedImageUrl(null); // Clear other selection
  };
  
  // Handle library/product image selection
  const handleImageSelect = (url: string) => {
    setSelectedImageUrl(url);
    setSelectedFile([]); // Clear file selection
  };

  // Confirm selection
  const handleConfirm = async () => {
    try {
      if (selectedFile.length > 0) {
        onImageSelected(selectedFile[0], null);
        onOpenChange(false);
      } 
      else if (selectedImageUrl) {
        onImageSelected(null, selectedImageUrl);
        onOpenChange(false);
      } 
      else {
        toast({
          title: "No image selected",
          description: "Please select an image to continue",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error handling image selection:', error);
      toast({
        title: "Failed to process selected image",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };
  
  // All images for the media library (combined)
  const allImages = [...libraryImages.map(img => ({
    url: img.url,
    title: img.filename || 'Library image',
    source: 'library'
  })), ...shopifyProductImages.map(img => ({
    url: img.url,
    title: img.productTitle,
    source: 'shopify'
  }))];
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] max-h-[800px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select {title}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col">
          <Separator className="mb-4" />
          
          <div className="flex-1 overflow-auto">
            <div className="space-y-6">
              {/* Upload section at the top */}
              <div className="bg-muted/30 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium mb-3">Upload New Image</h3>
                <FileUpload
                  onFilesSelected={handleFileSelected}
                  selectedFiles={selectedFile}
                  maxFiles={1}
                  singleFileMode={true}
                  uploadType="Image"
                />
              </div>
              
              <Separator />
              
              {/* Media library section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex justify-between items-center">
                  <span>Media Library</span>
                  <span className="text-xs text-muted-foreground">{allImages.length} images</span>
                </h3>
                
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : allImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No images found</h3>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                      Upload your first image to get started.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {allImages.map((image, index) => (
                      <div
                        key={`${image.source}-${index}`}
                        className="group cursor-pointer"
                        onClick={() => handleImageSelect(image.url)}
                      >
                        <div className={`
                          relative rounded-md overflow-hidden aspect-square border-2
                          ${selectedImageUrl === image.url ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-muted-foreground/30'}
                        `}>
                          <img
                            src={image.url}
                            alt={image.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          
                          {/* Selection indicator */}
                          {selectedImageUrl === image.url && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <div className="bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="h-4 w-4" />
                              </div>
                            </div>
                          )}
                          
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center">
                            <Button 
                              variant="secondary" 
                              size="sm"
                              className="rounded-full shadow-lg"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImageSelect(image.url);
                              }}
                            >
                              Select
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate" title={image.title}>
                          {image.title}
                        </p>
                        <p className="text-xs text-muted-foreground opacity-50">
                          {image.source === 'library' ? 'Library' : 'Shopify'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                
                {!isShopifyConnected && (
                  <div className="mt-4 bg-muted/20 rounded-lg p-4">
                    <div className="flex items-center">
                      <ShoppingBag className="h-5 w-5 text-muted-foreground mr-2" />
                      <p className="text-sm">
                        Connect your Shopify store to see product images here.
                        <Button 
                          variant="link" 
                          className="px-1 h-auto text-xs"
                          onClick={() => navigate('/settings')}
                        >
                          Connect Shopify
                        </Button>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="mt-4 pt-4 border-t flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedFile.length > 0
              ? `Selected: ${selectedFile[0].name}` 
              : selectedImageUrl 
                ? 'Image selected from library'
                : 'No image selected'}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>
              Select Image
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}