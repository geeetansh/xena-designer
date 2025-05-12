import { useState } from 'react';
import { ShopifyProduct } from '@/services/shopifyService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getCdnUrl } from '@/lib/utils';

interface ProductImagesModalProps {
  product: ShopifyProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductImagesModal({ product, open, onOpenChange }: ProductImagesModalProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  
  if (!product) return null;
  
  const images = product.images.edges.map(edge => edge.node);
  
  const handlePrevImage = () => {
    setSelectedImageIndex(prev => 
      prev === 0 ? images.length - 1 : prev - 1
    );
  };
  
  const handleNextImage = () => {
    setSelectedImageIndex(prev => 
      prev === images.length - 1 ? 0 : prev + 1
    );
  };

  const handleDownload = async () => {
    if (images.length === 0 || !images[selectedImageIndex]) return;
    
    try {
      setDownloading(true);
      const imageUrl = images[selectedImageIndex].url;
      const fileName = `product-${product.handle}-${selectedImageIndex + 1}.jpg`;
      
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Image downloaded",
        description: "The product image has been downloaded successfully"
      });
    } catch (error) {
      console.error('Error downloading image:', error);
      toast({
        title: "Download failed",
        description: "Failed to download the image",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };
  
  const getStoreProductUrl = (handle: string) => {
    // This is a placeholder function - you'll need to implement this with your actual store URL
    return `https://your-store.myshopify.com/products/${handle}`;
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md md:max-w-5xl sm:max-w-[60%] p-4 md:p-6">
        <DialogHeader>
          <DialogTitle className="text-base md:text-xl line-clamp-1">
            {product.title}
          </DialogTitle>
          <DialogDescription className="text-xs md:text-sm">
            Product images from your Shopify store
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 py-2 md:py-4">
          {/* Left side - Image */}
          <div className="space-y-3 md:space-y-4">
            {images.length > 0 ? (
              <>
                <div className="relative rounded-lg overflow-hidden bg-neutral-50 dark:bg-neutral-900 border">
                  <div className="aspect-square">
                    <img 
                      src={getCdnUrl(images[selectedImageIndex].url)} 
                      alt={images[selectedImageIndex].altText || `Product image ${selectedImageIndex + 1}`}
                      className="object-contain w-full h-full"
                      loading="lazy"
                    />
                  </div>
                  
                  {/* Image navigation buttons */}
                  {images.length > 1 && (
                    <>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute left-1 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm hover:bg-background/90 h-7 w-7 md:h-10 md:w-10"
                        onClick={handlePrevImage}
                      >
                        <ChevronLeft className="h-4 w-4 md:h-6 md:w-6" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-1 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm hover:bg-background/90 h-7 w-7 md:h-10 md:w-10"
                        onClick={handleNextImage}
                      >
                        <ChevronRight className="h-4 w-4 md:h-6 md:w-6" />
                      </Button>
                    </>
                  )}
                  
                  {/* Image counter */}
                  <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm text-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                    {selectedImageIndex + 1} / {images.length}
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button 
                    className="flex-1 gap-1 h-8 md:h-10 text-xs md:text-sm"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin mr-1 md:mr-2" />
                    ) : (
                      <Download className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                    )}
                    Download Image
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-1 h-8 md:h-10 text-xs md:text-sm"
                    onClick={() => window.open(getStoreProductUrl(product.handle), '_blank')}
                  >
                    <ExternalLink className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                    View in Store
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-8 text-center border rounded-lg">
                <div className="space-y-3">
                  <ImageIcon className="h-8 w-8 md:h-12 md:w-12 text-muted-foreground mx-auto" />
                  <p className="text-xs md:text-sm text-muted-foreground">No images available for this product</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Right side - Details */}
          <div className="space-y-4 md:space-y-6">
            <div className="space-y-2">
              <h3 className="font-medium text-sm md:text-lg">Product Details</h3>
              <div className="border rounded-md p-3 md:p-4 space-y-2 md:space-y-3 text-xs md:text-sm">
                <div>
                  <h4 className="text-xs md:text-sm font-medium text-muted-foreground">Product Name</h4>
                  <p className="text-sm md:text-base">{product.title}</p>
                </div>
                
                {product.variants.edges.length > 0 && (
                  <div>
                    <h4 className="text-xs md:text-sm font-medium text-muted-foreground">Price</h4>
                    <p className="text-sm md:text-base font-medium">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: product.variants.edges[0].node.price.currencyCode,
                      }).format(parseFloat(product.variants.edges[0].node.price.amount))}
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Thumbnails section */}
            {images.length > 1 && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm md:text-lg">Available Images</h3>
                <div className="grid grid-cols-4 sm:grid-cols-4 gap-1 md:gap-2">
                  {images.map((image, index) => (
                    <div 
                      key={index}
                      className={`
                        cursor-pointer rounded-md overflow-hidden aspect-square border-2
                        ${selectedImageIndex === index ? 'border-primary' : 'border-transparent'}
                      `}
                      onClick={() => setSelectedImageIndex(index)}
                    >
                      <img 
                        src={getCdnUrl(image.url)} 
                        alt={image.altText || `Thumbnail ${index + 1}`}
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="space-y-2 hidden md:block">
              <h3 className="font-medium text-sm md:text-lg">Usage</h3>
              <p className="text-xs md:text-sm text-muted-foreground">
                These product images can be used as reference images for AI-generated content.
                Select an image above and download it to use in your image generation workflow.
              </p>
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex justify-end">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="h-8 md:h-10 text-xs md:text-sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}