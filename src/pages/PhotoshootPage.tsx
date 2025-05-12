import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  Camera, 
  Plus, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { LuDownload } from 'react-icons/lu';
import { GrFormView } from 'react-icons/gr';
import { MdOutlineDeleteOutline } from 'react-icons/md';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { LazyImage } from '@/components/LazyImage';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from "@/components/ui/card";
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
import { 
  fetchPhotoshoots, 
  Photoshoot,
  deletePhotoshoot,
} from '@/services/photoshootService';
import { ProductImagesModal } from '@/components/ProductImagesModal';
import { ShopifyProduct } from '@/services/shopifyService';
import { getTransformedImageUrl } from '@/lib/utils';

export default function PhotoshootPage() {
  const [photoshoots, setPhotoshoots] = useState<Photoshoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [photoshootToDelete, setPhotoshootToDelete] = useState<Photoshoot | null>(null);
  const [selectedPhotoshoot, setSelectedPhotoshoot] = useState<Photoshoot | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [adaptedProduct, setAdaptedProduct] = useState<ShopifyProduct | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { toast } = useToast();
  const navigate = useNavigate();

  // Check if the view is mobile
  useEffect(() => {
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    
    checkMobileView();
    window.addEventListener('resize', checkMobileView);
    
    return () => {
      window.removeEventListener('resize', checkMobileView);
    };
  }, []);
  
  useEffect(() => {
    // Initial load of photoshoots
    loadPhotoshoots();
    
    // Set up a realtime subscription to photoshoots table
    const channel = supabase
      .channel('photoshoot-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'photoshoots',
          // Only listen to changes for the current user's photoshoots
          filter: `user_id=eq.${supabase.auth.getSession().then(({ data }) => data.session?.user.id)}`
        },
        (payload) => {
          console.log('Photoshoot change detected:', payload);
          
          // Handle different types of changes
          if (payload.eventType === 'INSERT') {
            // Add new photoshoot to the list
            const newPhotoshoot = payload.new as Photoshoot;
            setPhotoshoots(prev => [newPhotoshoot, ...prev]);
          } 
          else if (payload.eventType === 'UPDATE') {
            // Update existing photoshoot in the list
            const updatedPhotoshoot = payload.new as Photoshoot;
            setPhotoshoots(prev => prev.map(p => 
              p.id === updatedPhotoshoot.id ? updatedPhotoshoot : p
            ));
          } 
          else if (payload.eventType === 'DELETE') {
            // Remove deleted photoshoot from the list
            const deletedId = payload.old?.id;
            if (deletedId) {
              setPhotoshoots(prev => prev.filter(p => p.id !== deletedId));
            }
          }
        }
      )
      .subscribe();
    
    // Clean up subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadPhotoshoots = async () => {
    try {
      setLoading(true);
      const { photoshoots: data } = await fetchPhotoshoots(50);
      setPhotoshoots(data);
    } catch (error) {
      console.error('Error loading photoshoots:', error);
      toast({
        title: 'Error',
        description: 'Failed to load images',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Simple refresh function that reloads data
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadPhotoshoots();
      toast({
        title: "Refreshed",
        description: "Photoshoot list has been refreshed"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh the photoshoot list",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteClick = (photoshoot: Photoshoot) => {
    setPhotoshootToDelete(photoshoot);
    setIsDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    if (!photoshootToDelete) return;
    
    try {
      setIsDeleting(true);
      await deletePhotoshoot(photoshootToDelete.id);
      
      // Check if the deleted photoshoot is part of a variation group
      if (photoshootToDelete.variation_group_id) {
        // Remove all photoshoots with the same variation_group_id
        setPhotoshoots(prev => prev.filter(p => 
          p.variation_group_id !== photoshootToDelete.variation_group_id
        ));
      } else {
        // Just remove the single photoshoot
        setPhotoshoots(photoshoots.filter(p => p.id !== photoshootToDelete.id));
      }
      
      toast({
        title: 'Image deleted',
        description: 'The image has been removed'
      });
    } catch (error) {
      console.error('Error deleting photoshoot:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete image',
        variant: 'destructive'
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setPhotoshootToDelete(null);
      setIsDeleting(false);
    }
  };
  
  const handleViewPhotoshoot = async (photoshoot: Photoshoot) => {
    setSelectedPhotoshoot(photoshoot);
    
    // Prepare data for ProductImagesModal by adapting Photoshoot to ShopifyProduct format
    const adaptedProduct: ShopifyProduct = {
      id: photoshoot.id,
      title: photoshoot.name,
      handle: photoshoot.id,
      featuredImage: photoshoot.result_image_url 
        ? {
            url: photoshoot.result_image_url,
            altText: photoshoot.prompt
          }
        : null,
      images: {
        edges: []
      },
      variants: {
        edges: [{
          node: {
            id: photoshoot.id,
            title: 'Photoshoot',
            price: {
              amount: '0',
              currencyCode: 'USD'
            }
          }
        }]
      }
    };
    
    // Add the product image
    adaptedProduct.images.edges.push({
      node: {
        url: photoshoot.product_image_url,
        altText: 'Product Image'
      }
    });
    
    // Add the result image if it exists
    if (photoshoot.result_image_url) {
      adaptedProduct.images.edges.push({
        node: {
          url: photoshoot.result_image_url,
          altText: photoshoot.prompt
        }
      });
    }
    
    // Add the reference image if it exists
    if (photoshoot.reference_image_url) {
      adaptedProduct.images.edges.push({
        node: {
          url: photoshoot.reference_image_url,
          altText: 'Reference Image'
        }
      });
    }
    
    // Check if this is part of a variation group and add other variations
    if (photoshoot.variation_group_id) {
      try {
        // Find all photoshoots with the same variation_group_id
        const variations = photoshoots.filter(p => 
          p.variation_group_id === photoshoot.variation_group_id &&
          p.id !== photoshoot.id &&
          p.status === 'completed' &&
          p.result_image_url
        );
        
        // Add each variation's result image
        variations.forEach((variation, index) => {
          if (variation.result_image_url) {
            adaptedProduct.images.edges.push({
              node: {
                url: variation.result_image_url,
                altText: `Variation ${(variation.variation_index || 0) + 1}`
              }
            });
          }
        });
      } catch (error) {
        console.error('Error fetching variations:', error);
      }
    }
    
    setAdaptedProduct(adaptedProduct);
    setIsProductModalOpen(true);
  };

  const handleDownloadImage = async (imageUrl: string, name: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xena-${name.substring(0, 20).replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
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
  
  // Filter out duplicate variation_group_id entries, showing only the first of each group
  const uniquePhotoshoots = photoshoots
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter((photoshoot, index, self) => {
      // If no variation_group_id, always include
      if (!photoshoot.variation_group_id) return true;
      
      // For items with variation_group_id, only include the first one
      // We'll use index 0 as the representative
      return self.findIndex(p => 
        p.variation_group_id === photoshoot.variation_group_id && 
        p.variation_index === 0
      ) === index;
    });

  const renderMobileView = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <p className="text-sm text-muted-foreground">Loading your assets...</p>
        </div>
      );
    }

    if (uniquePhotoshoots.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Camera className="h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium mb-1">No images found</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first image to get started</p>
          <Button 
            size="sm"
            onClick={() => navigate('/new-asset')}
            className="text-sm"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create New Asset
          </Button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-3">
        {uniquePhotoshoots.map((photoshoot) => {
          // Count total variations for this group
          const totalVariations = photoshoot.variation_group_id 
            ? photoshoots.filter(p => p.variation_group_id === photoshoot.variation_group_id).length 
            : 1;
            
          // Determine if the photoshoot is stuck
          const isStuck = photoshoot.status === 'processing' && 
            new Date(photoshoot.updated_at).getTime() < Date.now() - 10 * 60 * 1000; // 10 minutes
          
          // Transform image URLs for better performance
          const productImageUrl = getTransformedImageUrl(photoshoot.product_image_url, {
            width: 120,
            height: 120,
            format: 'webp',
            quality: 80
          });
          
          const resultImageUrl = photoshoot.result_image_url 
            ? getTransformedImageUrl(photoshoot.result_image_url, {
                width: 120,
                height: 120,
                format: 'webp',
                quality: 80
              }) 
            : null;
          
          return (
            <Card
              key={photoshoot.id}
              className={isStuck ? "bg-yellow-50/50 dark:bg-yellow-950/20" : ""}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  {/* Product and Result Images */}
                  <div className="shrink-0 space-y-2">
                    {/* Product Image */}
                    <div className="w-14 h-14 relative rounded-md overflow-hidden border">
                      <LazyImage 
                        src={productImageUrl}
                        alt="Product"
                        className="object-cover"
                      />
                    </div>
                    
                    {/* Result Image */}
                    {resultImageUrl ? (
                      <div className="w-14 h-14 relative rounded-md overflow-hidden border">
                        <LazyImage 
                          src={resultImageUrl}
                          alt="Result"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-14 h-14 flex items-center justify-center bg-muted rounded-md border">
                        {photoshoot.status === 'processing' ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : photoshoot.status === 'failed' ? (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        ) : (
                          <Camera className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Details and Actions */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 flex-1 min-w-0">
                        {/* Name and Type */}
                        <h3 className="font-medium text-sm line-clamp-1">{photoshoot.name}</h3>
                        
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Type Badge */}
                          <Badge variant="outline" className="capitalize text-[10px] h-5 px-1.5">
                            {photoshoot.type === 'static_ad' ? 'Static Ad' : 'Photoshoot'}
                          </Badge>
                          
                          {/* Status Badge */}
                          <StatusBadge 
                            status={photoshoot.status} 
                            isStuck={isStuck}
                            small={true}
                          />
                          
                          {/* Variation Count */}
                          {totalVariations > 1 && (
                            <span className="text-[10px] text-muted-foreground">
                              {totalVariations} variants
                            </span>
                          )}
                        </div>
                        
                        {/* Date */}
                        <p className="text-[10px] text-muted-foreground">
                          {formatDate(photoshoot.created_at)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex mt-2 space-x-1">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-7 px-2 text-xs flex-1"
                        onClick={() => handleViewPhotoshoot(photoshoot)}
                        disabled={photoshoot.status === 'pending' || photoshoot.status === 'processing'}
                      >
                        <GrFormView className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-7 px-2 text-xs flex-1"
                        onClick={() => photoshoot.result_image_url && handleDownloadImage(photoshoot.result_image_url, photoshoot.name)}
                        disabled={!photoshoot.result_image_url}
                      >
                        <LuDownload className="h-3.5 w-3.5 mr-1" />
                        Download
                      </Button>
                      
                      <Button 
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeleteClick(photoshoot)}
                      >
                        <MdOutlineDeleteOutline className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderDesktopView = () => {
    if (loading) {
      return (
        <div className="h-40 text-center flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="mt-2 text-muted-foreground">Loading images...</p>
        </div>
      );
    }
    
    if (uniquePhotoshoots.length === 0) {
      return (
        <div className="h-40 text-center flex flex-col items-center justify-center">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Camera className="h-10 w-10 mb-3" />
            <p className="font-medium">No images found</p>
            <p className="text-sm mt-1">Create your first image to get started</p>
            <Button 
              className="mt-4" 
              size="sm" 
              onClick={() => navigate('/new-asset')}
            >
              Create New Asset
            </Button>
          </div>
        </div>
      );
    }
    
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px] pl-6">Image</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {uniquePhotoshoots.map((photoshoot) => {
            // Count total variations for this group
            const totalVariations = photoshoot.variation_group_id 
              ? photoshoots.filter(p => p.variation_group_id === photoshoot.variation_group_id).length 
              : 1;
            
            // Determine if the photoshoot is stuck
            const isStuck = photoshoot.status === 'processing' && 
              new Date(photoshoot.updated_at).getTime() < Date.now() - 10 * 60 * 1000; // 10 minutes
            
            // Transform image URLs for better performance
            const productImageUrl = getTransformedImageUrl(photoshoot.product_image_url, {
              width: 150,
              height: 150,
              format: 'webp',
              quality: 80
            });
            
            const resultImageUrl = photoshoot.result_image_url 
              ? getTransformedImageUrl(photoshoot.result_image_url, {
                  width: 150,
                  height: 150,
                  format: 'webp',
                  quality: 80
                }) 
              : null;
            
            return (
              <TableRow key={photoshoot.id} className={isStuck ? "bg-yellow-50/50 dark:bg-yellow-950/20" : ""}>
                <TableCell className="font-medium pl-6">
                  <div className="max-w-[250px]">
                    <div className="font-medium truncate">{photoshoot.name}</div>
                    {totalVariations > 1 && (
                      <span className="text-xs text-muted-foreground">
                        {totalVariations} variations
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="w-16 h-16 relative rounded-md overflow-hidden border">
                    <LazyImage 
                      src={productImageUrl}
                      alt="Product"
                      className="object-cover"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  {resultImageUrl ? (
                    <div className="w-16 h-16 relative rounded-md overflow-hidden border">
                      <LazyImage 
                        src={resultImageUrl}
                        alt="Result"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 flex items-center justify-center bg-muted rounded-md border">
                      {photoshoot.status === 'processing' ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : photoshoot.status === 'failed' ? (
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      ) : (
                        <Camera className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {photoshoot.type === 'static_ad' ? 'Static Ad' : 'Photoshoot'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge 
                    status={photoshoot.status} 
                    isStuck={isStuck}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(photoshoot.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleViewPhotoshoot(photoshoot)}
                      disabled={photoshoot.status === 'pending' || photoshoot.status === 'processing'}
                      title="View details"
                    >
                      <GrFormView className="h-5 w-5" />
                    </Button>
                    
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => photoshoot.result_image_url && handleDownloadImage(photoshoot.result_image_url, photoshoot.name)}
                      disabled={!photoshoot.result_image_url}
                      title="Download image"
                    >
                      <LuDownload className="h-4 w-4" />
                    </Button>
                    
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDeleteClick(photoshoot)}
                      title="Delete"
                    >
                      <MdOutlineDeleteOutline className="h-5 w-5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-4 md:space-y-6">
      {/* Create button and management options */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold">My Assets</h1>
        <div className="flex gap-2 md:gap-3">
          <Button 
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-1.5 h-8 md:h-9 text-xs md:text-sm"
            size="sm"
          >
            {isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="hidden md:inline">Refresh</span>
          </Button>
          
          <Button 
            onClick={() => navigate('/new-asset')} 
            className="gap-1.5 h-8 md:h-9 text-xs md:text-sm"
            size="sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Create New Asset</span>
            <span className="inline md:hidden">Create</span>
          </Button>
        </div>
      </div>
      
      {/* Photoshoots view - conditionally render based on screen size */}
      <div className="border rounded-lg overflow-hidden shadow-sm">
        <div className="md:hidden">
          {renderMobileView()}
        </div>
        
        <div className="hidden md:block">
          {renderDesktopView()}
        </div>
      </div>
      
      {/* Product Images Modal for viewing photoshoot details */}
      <ProductImagesModal
        product={adaptedProduct}
        open={isProductModalOpen}
        onOpenChange={setIsProductModalOpen}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-xs md:max-w-md p-4 md:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base md:text-lg">Delete Image</AlertDialogTitle>
            <AlertDialogDescription className="text-xs md:text-sm">
              {photoshootToDelete && photoshootToDelete.variation_group_id && 
               photoshoots.filter(p => p.variation_group_id === photoshootToDelete.variation_group_id).length > 1 ? (
                "Are you sure you want to delete all variations of this image? This action cannot be undone."
              ) : (
                "Are you sure you want to delete this image? This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 md:mt-4 gap-2">
            <AlertDialogCancel 
              disabled={isDeleting} 
              className="h-8 md:h-9 text-xs md:text-sm"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 md:h-9 text-xs md:text-sm"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-1 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4 animate-spin" />
                  Deleting...
                </>
              ) : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
  isStuck?: boolean;
  small?: boolean;
}

function StatusBadge({ status, isStuck = false, small = false }: StatusBadgeProps) {
  // If the status is processing but appears to be stuck, show a warning variant
  if (status === 'processing' && isStuck) {
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800 text-[10px] md:text-xs h-5 px-1.5 md:px-2">
        <AlertTriangle className="h-2.5 w-2.5 md:h-3 md:w-3 mr-0.5 md:mr-1" />
        Stuck
      </Badge>
    );
  }
  
  const iconSize = small ? "h-2.5 w-2.5 mr-0.5" : "h-3 w-3 mr-1";
  const textSize = small ? "text-[10px] h-5 px-1.5" : "text-xs";
  
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className={`bg-muted/50 ${textSize}`}>
          <Clock className={iconSize} />
          Pending
        </Badge>
      );
    case 'processing':
      return (
        <Badge variant="outline" className={`bg-blue-500/10 text-blue-500 border-blue-200 dark:border-blue-800 ${textSize}`}>
          <Loader2 className={`${iconSize} animate-spin`} />
          Processing
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="outline" className={`bg-green-500/10 text-green-500 border-green-200 dark:border-green-800 ${textSize}`}>
          <CheckCircle2 className={iconSize} />
          Done
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className={`bg-red-500/10 text-red-500 border-red-200 dark:border-red-800 ${textSize}`}>
          <AlertTriangle className={iconSize} />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="outline" className={textSize}>{status}</Badge>;
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  
  // If less than 24 hours ago, show relative time
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHrs = diffMs / (1000 * 60 * 60);
  
  if (diffHrs < 1) {
    const mins = Math.round(diffMs / (1000 * 60));
    return `${mins} min${mins !== 1 ? 's' : ''} ago`;
  } else if (diffHrs < 24) {
    const hrs = Math.round(diffHrs);
    return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  } else {
    // Format as MM/DD/YYYY
    return date.toLocaleDateString();
  }
}