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
import { useNavigate } from 'react-router-dom';
import Masonry from 'react-masonry-css';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { ImageDetails } from '@/components/ImageDetails';

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
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null);
  const [isJobDetailsOpen, setIsJobDetailsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const latestJobsRef = useRef<GenerationJob[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Masonry breakpoints - updated for mobile view to show 2 columns
  const breakpointColumnsObj = {
    default: 4,
    1100: 3,
    700: 2,
    500: 2  // Updated to show 2 columns on mobile instead of 1
  };

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
              created_at,
              layout
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

  // Action handlers
  const handleViewDetails = (job: GenerationJob) => {
    setSelectedJob(job);
    setIsJobDetailsOpen(true);
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
            onClick={() => navigate('/automation-builder')} 
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
          <Button onClick={() => navigate('/automation-builder')}>
            Create Automated Ads
          </Button>
        </div>
      ) : (
        <Masonry
          breakpointCols={breakpointColumnsObj}
          className="flex w-auto -ml-4"
          columnClassName="pl-4 bg-clip-padding"
        >
          {generationJobs.map((job) => {
            const layout = job.prompt_variations?.automation_sessions?.layout || 'auto';
            
            return (
              <div 
                key={job.id}
                className="mb-4 relative group overflow-hidden rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <div className={`w-full ${layout === 'portrait' ? 'aspect-[2/3]' : layout === 'landscape' ? 'aspect-[3/2]' : 'aspect-square'} bg-background`}>
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
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                  <Button 
                    size="sm" 
                    variant="secondary"
                    className="rounded-full shadow-lg text-xs h-7 px-2 md:h-8 md:px-3"
                    onClick={() => handleViewDetails(job)}
                  >
                    <Eye className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                    View
                  </Button>
                </div>
              </div>
            );
          })}
        </Masonry>
      )}

      {/* Image Details */}
      {selectedJob && (
        <ImageDetails
          open={isJobDetailsOpen}
          onOpenChange={setIsJobDetailsOpen}
          image={{
            id: selectedJob.id,
            image_url: selectedJob.image_url || '',
            status: selectedJob.status,
            prompt: selectedJob.prompt,
            created_at: selectedJob.created_at
          }}
        />
      )}
    </div>
  );
}