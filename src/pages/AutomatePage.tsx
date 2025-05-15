import { useState, useEffect, useRef } from 'react';
import { 
  ImageIcon,
  Calendar,
  Download,
  Eye,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LazyImage } from '@/components/LazyImage';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { AutomatedAdsBuilderModal } from '@/components/AutomatedAdsBuilderModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";

interface GenerationJob {
  id: string;
  variation_id: string;
  prompt: string;
  image_url?: string;
  status: string;
  error_message?: string;
  created_at: string;
  prompt_variations?: any;
}

export default function AutomatePage() {
  // State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null);
  const [isJobDetailsOpen, setIsJobDetailsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const latestJobsRef = useRef<GenerationJob[]>([]);
  const { toast } = useToast();

  // Load recent jobs on mount
  useEffect(() => {
    setIsLoading(true);
    fetchLatestJobs()
      .finally(() => setIsLoading(false));
    
    // Set up interval to fetch latest jobs every 10 seconds
    const interval = setInterval(() => {
      fetchLatestJobs();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  // Fetch latest jobs
  const fetchLatestJobs = async () => {
    try {
      setIsRefreshing(true);
      const { data, error } = await supabase
        .from('generation_jobs')
        .select(`
          *,
          prompt_variations!inner(
            session_id,
            index,
            automation_sessions(
              product_image_url,
              reference_ad_url,
              created_at
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);
        
      if (error) {
        console.error('Error fetching latest jobs:', error);
        return;
      }
      
      latestJobsRef.current = data;
      setGenerationJobs(data);
    } catch (error) {
      console.error('Error fetching latest jobs:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle session creation success
  const handleSessionCreated = (sessionId: string) => {
    toast({
      title: "Ad generation started",
      description: "Your automated ads are being created. Check back shortly to see the results."
    });
    
    // Refresh the jobs list after a short delay
    setTimeout(() => {
      fetchLatestJobs();
    }, 2000);
  };

  // Action handlers
  const handleViewDetails = (job: GenerationJob) => {
    setSelectedJob(job);
    setIsJobDetailsOpen(true);
  };

  const handleDownloadImage = async (imageUrl: string, prompt: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xena-ad-${prompt.substring(0, 20).replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Image downloaded",
        description: "The ad image has been downloaded successfully"
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

  return (
    <div className="max-w-6xl mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl md:text-2xl font-bold">Automated Ads</h1>
        <div className="flex gap-2 md:gap-3">
          <Button 
            variant="outline"
            onClick={() => fetchLatestJobs()}
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
            onClick={() => setIsModalOpen(true)} 
            className="gap-1.5 h-8 md:h-9 text-xs md:text-sm"
            size="sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Generate</span>
          </Button>
        </div>
      </div>

      {/* Gallery view */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading...</span>
        </div>
      ) : generationJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
          <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No automated ads yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Create your first automated ad campaign to see the results here.
          </p>
          <Button onClick={() => setIsModalOpen(true)}>
            Create Automated Ads
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {generationJobs.map((job) => (
            <div 
              key={job.id}
              className="relative group overflow-hidden rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className="aspect-square w-full h-full bg-background">
                {job.status === 'failed' ? (
                  <div className="w-full h-full flex items-center justify-center bg-red-50/50 dark:bg-red-900/10">
                    <div className="flex flex-col items-center text-center p-4">
                      <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
                      <span className="text-xs text-red-600">Generation failed</span>
                    </div>
                  </div>
                ) : job.status === 'completed' && job.image_url ? (
                  <LazyImage
                    src={job.image_url}
                    alt="Generated ad"
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                    <div className="animate-pulse flex flex-col items-center">
                      <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                      <span className="mt-2 text-xs text-muted-foreground">
                        {job.status}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end">
                <div className="p-3 md:p-4 space-y-1">
                  <h3 className="text-white font-medium text-xs md:text-sm line-clamp-1">
                    Generated Ad
                  </h3>
                  <p className="text-white/80 text-[10px] md:text-xs">
                    {job.created_at ? format(new Date(job.created_at), 'MMM d, yyyy') : ''}
                  </p>
                  <div className="flex justify-between mt-1 md:mt-2">
                    <Button 
                      size="sm" 
                      variant="secondary"
                      className="rounded-full shadow-lg text-xs h-7 px-2 md:h-8 md:px-3"
                      onClick={() => handleViewDetails(job)}
                    >
                      <Eye className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                      View
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="secondary"
                      className="rounded-full shadow-lg h-7 w-7 p-0 md:h-8 md:w-8"
                      onClick={() => job.image_url && handleDownloadImage(job.image_url, job.prompt.substring(0, 30))}
                      disabled={!job.image_url || job.status !== 'completed'}
                    >
                      <Download className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Automation Builder Modal */}
      <AutomatedAdsBuilderModal 
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSuccess={handleSessionCreated}
      />

      {/* Image Details Dialog */}
      <Dialog open={isJobDetailsOpen} onOpenChange={setIsJobDetailsOpen}>
        {selectedJob && (
          <DialogContent className="max-w-4xl md:max-w-5xl sm:max-w-[80%] p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle className="text-xl">Ad Details</DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side - Generated Image */}
                <div className="space-y-4">
                  <h3 className="font-medium">Generated Ad</h3>
                  <div className="aspect-square rounded-lg overflow-hidden border bg-muted/30">
                    {selectedJob.status === 'failed' ? (
                      <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center">
                        <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                        <p className="text-sm font-medium">Generation failed</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {selectedJob.error_message || "The ad could not be generated"}
                        </p>
                      </div>
                    ) : selectedJob.status === 'completed' && selectedJob.image_url ? (
                      <img
                        src={selectedJob.image_url}
                        alt="Generated ad"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  
                  {/* Download button */}
                  {selectedJob.status === 'completed' && selectedJob.image_url && (
                    <Button 
                      onClick={() => handleDownloadImage(selectedJob.image_url!, selectedJob.prompt.substring(0, 30))}
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Image
                    </Button>
                  )}
                </div>
                
                {/* Right side - Details */}
                <div className="space-y-4">
                  {/* Prompt */}
                  <div className="space-y-2">
                    <h3 className="font-medium">Prompt</h3>
                    <div className="p-4 border rounded-lg bg-muted/30 text-sm">
                      <p>{selectedJob.prompt}</p>
                    </div>
                  </div>
                  
                  {/* Reference Images */}
                  {selectedJob.prompt_variations && (
                    <div className="space-y-2">
                      <h3 className="font-medium">Reference Images</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Product Image */}
                        {selectedJob.prompt_variations.automation_sessions?.product_image_url && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Product Image</p>
                            <div className="aspect-square border rounded-md overflow-hidden">
                              <LazyImage
                                src={selectedJob.prompt_variations.automation_sessions.product_image_url}
                                alt="Product"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* Reference Ad */}
                        {selectedJob.prompt_variations.automation_sessions?.reference_ad_url && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Reference Ad</p>
                            <div className="aspect-square border rounded-md overflow-hidden">
                              <LazyImage
                                src={selectedJob.prompt_variations.automation_sessions.reference_ad_url}
                                alt="Reference"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Created Date */}
                  <div className="space-y-2">
                    <h3 className="font-medium">Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Created</p>
                        <p className="flex items-center">
                          <Calendar className="h-3.5 w-3.5 mr-1.5" />
                          {selectedJob.created_at ? 
                            format(new Date(selectedJob.created_at), 'MMM d, yyyy HH:mm:ss') : 
                            'Unknown date'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <p className="capitalize">{selectedJob.status}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter className="px-4 py-3 border-t">
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}