import { useState, useEffect } from 'react';
import { ImageGallery } from '@/components/ImageGallery';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function GalleryPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeGenerations, setActiveGenerations] = useState<{
    batchId: string;
    total: number;
    completed: number;
    failed: number;
  }[]>([]);
  const navigate = useNavigate();

  // Check for active generations
  useEffect(() => {
    // Initial check for any active generations
    async function checkActiveGenerations() {
      try {
        console.log('Checking for active generations...');
        const { data, error } = await supabase
          .from('generation_tasks')
          .select('batch_id, status')
          .in('status', ['pending', 'processing'])
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Get unique batch IDs
          const batchIds = [...new Set(data.map(task => task.batch_id))];
          console.log(`Found ${batchIds.length} active batch(es)`);
          
          // Fetch status for each batch
          for (const batchId of batchIds) {
            const batchStatus = await supabase.rpc('get_batch_generation_status', {
              batch_id_param: batchId
            });
            
            if (batchStatus.data) {
              console.log(`Batch ${batchId} status:`, batchStatus.data);
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
        } else {
          console.log('No active generations found');
        }
      } catch (error) {
        console.error('Error checking active generations:', error);
      }
    }
    
    checkActiveGenerations();
    
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
          console.log('Received task update event:', payload);
          // When a task is updated, check if it's part of an active batch
          if (payload.new && payload.new.batch_id) {
            try {
              const { data } = await supabase.rpc('get_batch_generation_status', {
                batch_id_param: payload.new.batch_id
              });
              
              if (data) {
                console.log(`Updated batch ${payload.new.batch_id} status:`, data);
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
                      console.log(`Batch ${payload.new.batch_id} is complete, scheduling removal`);
                      setTimeout(() => {
                        setActiveGenerations(batches => 
                          batches.filter(b => b.batchId !== payload.new.batch_id)
                        );
                        setRefreshTrigger(prev => prev + 1); // Refresh gallery when batch completes
                      }, 2000);
                    }
                    
                    return updatedBatches;
                  } else if (data.total > data.completed + data.failed) {
                    // Add new batch if not complete
                    console.log(`Adding new batch ${payload.new.batch_id} to tracked batches`);
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
      console.log('Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, []);

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
    setRefreshTrigger(prev => prev + 1);
  };

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

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">My Creatives</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          className="h-8 text-xs"
        >
          Refresh
        </Button>
      </div>
      
      {/* Mobile view with 2 columns, desktop with 4 */}
      <div className="sm:hidden">
        <ImageGallery refreshTrigger={refreshTrigger} columns={2} />
      </div>
      <div className="hidden sm:block">
        <ImageGallery refreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
}