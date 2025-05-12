import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchAssets, deleteAsset, Asset } from '@/services/AssetsService';
import { ImageGallery } from '@/components/ImageGallery';
import { RawJsonView } from '@/components/RawJsonView';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { Loader2, Sparkles, Code, Image as ImageIcon, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Eye } from 'lucide-react';

export default function GalleryPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeGenerations, setActiveGenerations] = useState<{
    batchId: string;
    total: number;
    completed: number;
    failed: number;
  }[]>([]);
  const [activeTab, setActiveTab] = useState('images');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [images, setImages] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Storage keys for cache
  const GALLERY_CACHE_KEY = 'gallery_assets_cache';
  const GALLERY_CACHE_TIMESTAMP_KEY = 'gallery_assets_cache_timestamp';
  const CACHE_EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes

  // Listen for events to view specific image JSON logs
  useEffect(() => {
    const handleViewImageJson = (event: CustomEvent<{ imageId: string }>) => {
      setActiveTab('logs');
      setSelectedImageId(event.detail.imageId);
    };

    window.addEventListener('viewImageJson', handleViewImageJson as EventListener);
    
    return () => {
      window.removeEventListener('viewImageJson', handleViewImageJson as EventListener);
    };
  }, []);

  useEffect(() => {
    // Initial check for any active generations
    async function checkActiveGenerations() {
      try {
        const { data, error } = await supabase
          .from('generation_tasks')
          .select('batch_id, status')
          .in('status', ['pending', 'processing'])
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Get unique batch IDs
          const batchIds = [...new Set(data.map(task => task.batch_id))];
          
          // Fetch status for each batch
          for (const batchId of batchIds) {
            const batchStatus = await supabase.rpc('get_batch_generation_status', {
              batch_id_param: batchId
            });
            
            if (batchStatus.data) {
              setActiveGenerations(prev => [
                ...prev, 
                {
                  batchId,
                  total: batchStatus.data.total,
                  completed: batchStatus.data.completed,
                  failed: batchStatus.data.failed
                }
              ]);
            }
          }
        }
      } catch (error) {
        console.error('Error checking active generations:', error);
      }
    }
    
    checkActiveGenerations();
    
    // Try to load from cache first
    const loadFromCache = () => {
      try {
        const cachedDataString = localStorage.getItem(GALLERY_CACHE_KEY);
        const cachedTimestampString = localStorage.getItem(GALLERY_CACHE_TIMESTAMP_KEY);
        
        if (cachedDataString && cachedTimestampString) {
          const cachedTimestamp = parseInt(cachedTimestampString);
          const now = Date.now();
          
          // Use cache if it's not expired
          if (now - cachedTimestamp < CACHE_EXPIRATION_TIME) {
            const cachedData = JSON.parse(cachedDataString);
            setImages(cachedData.assets);
            setTotalCount(cachedData.totalCount);
            setHasMore(cachedData.hasMore);
            setPage(cachedData.page);
            setLoading(false);
            return true;
          }
        }
      } catch (error) {
        console.error('Error loading from cache:', error);
      }
      return false;
    };

    // Try cache first, if that fails, load fresh data
    if (!loadFromCache()) {
      loadAssets(1);
    }
    
    // Subscribe to generation task updates
    const channel = supabase
      .channel('gallery-generation-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'generation_tasks'
        },
        async (payload) => {
          // When a task is updated, check if it's part of an active batch
          if (payload.new && payload.new.batch_id) {
            try {
              const { data } = await supabase.rpc('get_batch_generation_status', {
                batch_id_param: payload.new.batch_id
              });
              
              if (data) {
                // Check if this batch is already being tracked
                setActiveGenerations(prev => {
                  const existing = prev.findIndex(batch => batch.batchId === payload.new.batch_id);
                  
                  if (existing >= 0) {
                    // Update existing batch
                    const updatedBatches = [...prev];
                    updatedBatches[existing] = {
                      batchId: payload.new.batch_id,
                      total: data.total,
                      completed: data.completed,
                      failed: data.failed
                    };
                    
                    // If batch is complete, schedule it for removal
                    if (data.completed + data.failed === data.total) {
                      setTimeout(() => {
                        setActiveGenerations(batches => 
                          batches.filter(b => b.batchId !== payload.new.batch_id)
                        );
                        // Load fresh data when a batch completes
                        loadAssets(1);
                      }, 2000);
                    }
                    
                    return updatedBatches;
                  } else if (data.total > data.completed + data.failed) {
                    // Add new batch if not complete
                    return [...prev, {
                      batchId: payload.new.batch_id,
                      total: data.total,
                      completed: data.completed,
                      failed: data.failed
                    }];
                  }
                  
                  return prev;
                });
              }
            } catch (error) {
              console.error('Error updating batch status:', error);
            }
          }
        }
      )
      .subscribe();
    
    // Cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  // Load assets with caching
  const loadAssets = async (pageNum: number, append: boolean = false) => {
    try {
      setError(null);
      
      if (!append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      const { assets, totalCount, hasMore } = await fetchAssets({
        source: 'generated',
        limit: 12, // Smaller batch size to prevent timeouts
        page: pageNum
      });
      
      // Update state with new data
      const newImages = append ? [...images, ...assets] : assets;
      setImages(newImages);
      setTotalCount(totalCount);
      setHasMore(hasMore);
      setPage(pageNum);
      
      // Cache the results
      try {
        localStorage.setItem(GALLERY_CACHE_KEY, JSON.stringify({
          assets: newImages,
          totalCount,
          hasMore,
          page: pageNum
        }));
        localStorage.setItem(GALLERY_CACHE_TIMESTAMP_KEY, Date.now().toString());
      } catch (error) {
        console.error('Error caching gallery data:', error);
        // Continue even if caching fails
      }
      
    } catch (error) {
      console.error('Error loading assets:', error);
      setError(error instanceof Error ? error.message : 'Failed to load images');
      
      toast({
        title: 'Error loading images',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsRefreshing(false);
    }
  };
  
  // Handle loading more images
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      const nextPage = page + 1;
      loadAssets(nextPage, true);
    }
  };

  // Calculate combined progress across all active batches
  const calculateProgress = () => {
    if (activeGenerations.length === 0) return 0;
    
    const totalImages = activeGenerations.reduce((sum, batch) => sum + batch.total, 0);
    const completedImages = activeGenerations.reduce(
      (sum, batch) => sum + batch.completed + batch.failed, 0
    );
    
    return (completedImages / totalImages) * 100;
  };

  // Handle refresh for both tabs
  const handleRefresh = () => {
    setIsRefreshing(true);
    
    // Clear cache
    try {
      localStorage.removeItem(GALLERY_CACHE_KEY);
      localStorage.removeItem(GALLERY_CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
    
    // Reset states and load fresh data
    setPage(1);
    setImages([]);
    setRefreshTrigger(prev => prev + 1);
    loadAssets(1, false);
  };
  
  // Set up intersection observer for infinite loading
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loadingMore || loading) return;
    
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          handleLoadMore();
        }
      },
      { threshold: 0.5 }
    );
    
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, images]);
  
  // Convert Assets to format expected by ImageGallery
  const convertedImages = useMemo(() => {
    return images.map(asset => ({
      id: asset.id,
      url: asset.original_url,
      prompt: asset.filename || 'Generated Image',
      created_at: asset.created_at,
      reference_images: [], // Empty since we don't have reference data here
      variation_group_id: asset.variation_group_id,
      variation_index: asset.variation_index
    }));
  }, [images]);

  // The grid of images - memoized to prevent unnecessary re-renders
  const imageGrid = useMemo(() => {
    if (loading && images.length === 0) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="aspect-square rounded-lg shadow-sm">
              <Skeleton className="w-full h-full rounded-lg" />
            </div>
          ))}
        </div>
      );
    }
    
    if (images.length === 0 && !loading) {
      return (
        <div className="flex flex-col items-center justify-center h-48 md:h-64 text-center">
          <ImageIcon className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-3 md:mb-4" />
          <h3 className="text-base md:text-lg font-medium">No images yet</h3>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Upload reference images and generate your first AI image
          </p>
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
        {images.map((image) => {
          return (
            <div 
              key={image.id} 
              className="relative group overflow-hidden rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className="aspect-square w-full h-full bg-background">
                <img
                  src={image.original_url} 
                  alt={image.filename || 'Generated image'}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end">
                <div className="p-2 md:p-4 space-y-1">
                  <h3 className="text-white font-medium text-xs md:text-sm line-clamp-1">
                    {image.filename || 'Generated image'}
                  </h3>
                  <div className="flex justify-between mt-1 md:mt-2">
                    <Button 
                      size="sm" 
                      variant="secondary"
                      className="rounded-full shadow-lg text-xs h-7 px-2 md:h-8 md:px-3"
                      onClick={() => setSelectedImageId(image.id)}
                    >
                      <Eye className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                      View
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      className="rounded-full shadow-lg h-7 w-7 p-0 md:h-8 md:w-8"
                      onClick={() => {
                        // Implement delete functionality here
                        if (confirm('Are you sure you want to delete this image?')) {
                          deleteAsset(image.id).then(() => {
                            setImages(prev => prev.filter(img => img.id !== image.id));
                            toast({
                              title: 'Image deleted',
                              description: 'The image has been deleted successfully',
                            });
                          }).catch(err => {
                            toast({
                              title: 'Error deleting image',
                              description: err.message,
                              variant: 'destructive',
                            });
                          });
                        }
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
    );
  }, [images, loading, toast]);

  return (
    <div>
      {activeGenerations.length > 0 && (
        <div className="mb-4 md:mb-6 p-3 md:p-6 bg-gradient-to-r from-background/80 to-background/40 backdrop-blur-sm border border-border/40 rounded-lg md:rounded-2xl shadow-sm">
          <div className="space-y-2 md:space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <h3 className="font-medium text-base md:text-lg flex items-center">
                  <Sparkles className="h-4 w-4 md:h-5 md:w-5 mr-1 md:mr-2 text-amber-500" />
                  <span className="line-clamp-2 text-sm md:text-base">
                    Your images are being generated, please wait a few moments!
                  </span>
                </h3>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full text-xs"
                onClick={() => navigate('/photoshoot')}
              >
                Add more
              </Button>
            </div>
            
            <Progress 
              value={calculateProgress()} 
              className="h-2 md:h-3 bg-background/80"
            />
          </div>
        </div>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex justify-between items-center">
          <TabsList className="h-9">
            <TabsTrigger value="images" className="flex items-center gap-1 px-2.5 text-xs md:text-sm">
              <ImageIcon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span>Creatives</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-1 px-2.5 text-xs md:text-sm">
              <Code className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span>JSON Logs</span>
            </TabsTrigger>
          </TabsList>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            className="h-8 text-xs"
            disabled={isRefreshing || loading}
          >
            {isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Refresh
          </Button>
        </div>
        
        <TabsContent value="images" className="mt-2 md:mt-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error loading images</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        
          {/* Image Grid */}
          {imageGrid}
          
          {/* Load more button */}
          {hasMore && !loading && (
            <div ref={loadMoreRef} className="flex justify-center mt-6 mb-4">
              <Button 
                onClick={handleLoadMore} 
                disabled={loadingMore}
                variant="outline"
                size="sm"
                className="w-full text-xs md:text-sm md:max-w-xs h-8 md:h-10"
              >
                {loadingMore ? (
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
        </TabsContent>
        
        <TabsContent value="logs">
          <RawJsonView 
            refreshTrigger={refreshTrigger} 
            selectedImageId={selectedImageId} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}