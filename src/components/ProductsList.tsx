import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShopifyProduct, 
  fetchShopifyProducts, 
  getShopifyCredentials 
} from '@/services/shopifyService';
import { Button } from '@/components/ui/button';
import { 
  ExternalLink, 
  Loader2, 
  ShoppingBag, 
  Image as ImageIcon,
  Images,
  Eye,
  RefreshCw
} from 'lucide-react';
import { SiShopify } from 'react-icons/si';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ProductImagesModal } from './ProductImagesModal';
import { LazyImage } from './LazyImage';
import { useNavigate } from 'react-router-dom';
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

export function ProductsList() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const dataFetchedRef = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadProducts = async (cursor?: string) => {
    try {
      if (!cursor) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      const { products: fetchedProducts, hasNextPage, endCursor: nextCursor } = await fetchShopifyProducts(20, cursor);
      
      if (cursor) {
        setProducts(prev => [...prev, ...fetchedProducts]);
      } else {
        setProducts(fetchedProducts);
      }
      
      setHasMore(hasNextPage);
      setEndCursor(nextCursor);
      setTotalCount(prev => cursor ? prev + fetchedProducts.length : fetchedProducts.length);
      dataFetchedRef.current = true;
      
    } catch (error) {
      console.error('Error loading products:', error);
      toast({
        title: 'Error',
        description: 'Failed to load products from Shopify',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    async function checkConnection() {
      try {
        const credentials = await getShopifyCredentials();
        
        if (credentials) {
          setIsConnected(true);
          setStoreUrl(credentials.store_url);
        } else {
          setIsConnected(false);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error checking Shopify connection:', error);
        setIsConnected(false);
        setLoading(false);
      }
    }
    
    checkConnection();
  }, []);

  // Only load products when they're needed
  useEffect(() => {
    if (isConnected && !dataFetchedRef.current) {
      loadProducts();
    }
  }, [isConnected]);

  const handleLoadMore = () => {
    if (hasMore && !loadingMore && endCursor) {
      loadProducts(endCursor);
    }
  };

  const openProductImages = (product: ShopifyProduct) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loadingMore) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );
    
    observer.observe(loadMoreRef.current);
    
    return () => observer.disconnect();
  }, [hasMore, loadingMore, endCursor]);

  // Helper function to format currency - moved here before its usage
  const formatCurrency = (amount: string, currencyCode: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(parseFloat(amount));
  };

  // Memoize product cards to prevent unnecessary re-renders
  const productCards = useMemo(() => {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
        {products.map((product) => (
          <div 
            key={product.id} 
            className="relative group overflow-hidden rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
          >
            <div className="aspect-square w-full h-full bg-background">
              {product.featuredImage ? (
                <LazyImage 
                  src={product.featuredImage.url}
                  alt={product.featuredImage.altText || product.title}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <ImageIcon className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground" />
                </div>
              )}
            </div>
            
            {/* Image count badge */}
            {product.images.edges.length > 1 && (
              <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm text-foreground rounded-full px-1.5 py-0.5 text-[10px] md:text-xs font-medium shadow-sm">
                {product.images.edges.length} images
              </div>
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end">
              <div className="p-2 md:p-4 space-y-1">
                <h3 className="text-white font-medium text-xs md:text-sm line-clamp-1" title={product.title}>{product.title}</h3>
                
                {product.variants.edges.length > 0 && (
                  <p className="text-white/80 text-[10px] md:text-xs">
                    {formatCurrency(
                      product.variants.edges[0].node.price.amount,
                      product.variants.edges[0].node.price.currencyCode
                    )}
                  </p>
                )}
                
                <Button 
                  size="sm" 
                  variant="secondary"
                  className="rounded-full shadow-lg mt-1 md:mt-2 w-full h-7 md:h-8 text-xs md:text-sm"
                  onClick={() => openProductImages(product)}
                >
                  <Eye className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                  View Details
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }, [products]);

  if (loading && products.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="aspect-square rounded-lg shadow-sm">
              <Skeleton className="w-full h-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-6 md:py-12 text-center">
        <SiShopify className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-3 md:mb-4" />
        <h3 className="text-lg md:text-xl font-medium mb-1 md:mb-2">Connect Your Shopify Store</h3>
        <p className="text-xs md:text-sm text-muted-foreground max-w-md mb-4 md:mb-6">
          To view your products, you need to connect your Shopify store in the settings tab.
        </p>
        <Button
          onClick={() => navigate('/settings')}
          className="gap-2 h-8 md:h-10 text-xs md:text-sm"
          size="sm"
        >
          <SiShopify className="h-3 w-3 md:h-4 md:w-4" />
          Connect Shopify
        </Button>
      </div>
    );
  }

  if (products.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 md:py-12 text-center">
        <ShoppingBag className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-3 md:mb-4" />
        <h3 className="text-lg md:text-xl font-medium mb-1 md:mb-2">No Products Found</h3>
        <p className="text-xs md:text-sm text-muted-foreground max-w-md mb-4 md:mb-6">
          We couldn't find any products in your Shopify store. Add products to your store or check your connection settings.
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => loadProducts()}
            className="gap-2 h-8 md:h-10 text-xs md:text-sm"
            size="sm"
          >
            <RefreshCw className="h-3 w-3 md:h-4 md:w-4" />
            Refresh
          </Button>
          <Button
            onClick={() => navigate('/settings')}
            className="h-8 md:h-10 text-xs md:text-sm"
            size="sm"
          >
            Check Settings
          </Button>
        </div>
      </div>
    );
  }

  const getStoreProductUrl = (handle: string) => {
    let baseUrl = storeUrl;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    return `${baseUrl}/products/${handle}`;
  };

  return (
    <>
      <div className="mb-3 md:mb-4 flex justify-between items-center">
        <h2 className="text-base md:text-lg font-medium">Shopify Products ({totalCount})</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadProducts()}
          className="gap-2 h-7 md:h-8 text-xs md:text-sm"
        >
          <RefreshCw className="h-3 w-3 md:h-4 md:w-4" />
          Refresh
        </Button>
      </div>
      
      {productCards}
      
      {/* Loading more indicator and load more button */}
      {hasMore && (
        <div className="mt-6 md:mt-8 flex flex-col items-center" ref={loadMoreRef}>
          {loadingMore ? (
            <div className="flex items-center">
              <Loader2 className="h-5 w-5 md:h-6 md:w-6 animate-spin mr-2" />
              <p className="text-xs md:text-sm">Loading more products...</p>
            </div>
          ) : (
            <Button 
              onClick={handleLoadMore} 
              variant="outline"
              size="sm"
              className="text-xs md:text-sm"
            >
              Load More Products
            </Button>
          )}
        </div>
      )}
      
      {/* Product Images Modal */}
      <ProductImagesModal 
        product={selectedProduct}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </>
  );
}