import { GenerationForm } from '@/components/GenerationForm';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Progress } from '@/components/ui/progress';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export default function GeneratePage() {
  const [refreshGallery, setRefreshGallery] = useState(0);
  const [activeGenerations, setActiveGenerations] = useState<{
    batchId: string;
    total: number;
    completed: number;
    failed: number;
  }[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check for active generations
  useEffect(() => {
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
      .channel('generate-page-updates')
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

  // Calculate progress percentage
  const calculateProgress = () => {
    if (activeGenerations.length === 0) return 0;
    
    const totalImages = activeGenerations.reduce((sum, batch) => sum + batch.total, 0);
    const completedImages = activeGenerations.reduce(
      (sum, batch) => sum + batch.completed + batch.failed, 0
    );
    
    return (completedImages / totalImages) * 100;
  };

  // Get the total number of images being generated
  const getTotalImagesCount = () => {
    return activeGenerations.reduce((sum, batch) => sum + batch.total, 0);
  };

  // Get the completed images count
  const getCompletedImagesCount = () => {
    return activeGenerations.reduce((sum, batch) => sum + batch.completed + batch.failed, 0);
  };

  const handleImageGenerated = () => {
    console.log('handleImageGenerated called in GeneratePage');
    
    // This function is called immediately when generation is started
    setRefreshGallery(prev => prev + 1);
    
    // Show confirmation toast immediately
    toast({
      title: "Generation started",
      description: "Your images are now being created. Check the gallery when they're ready!",
      duration: 5000
    });
  };

  return (
    <div className="max-w-4xl mx-auto w-full">
      {/* Show the same generation progress banner as in Gallery */}
      {activeGenerations.length > 0 && (
        <div className="mb-6 p-6 bg-gradient-to-r from-background/80 to-background/40 backdrop-blur-sm border border-border/40 rounded-2xl shadow-sm">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <h3 className="font-medium text-lg flex items-center">
                  <Sparkles className="h-5 w-5 mr-2 text-amber-500" />
                  Your images are now being generated, please give a minute or two for each image!
                </h3>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full"
                onClick={() => navigate('/gallery')}
              >
                View in gallery
              </Button>
            </div>
            
            <Progress 
              value={calculateProgress()} 
              className="h-3 bg-background/80"
            />
          </div>
        </div>
      )}
      
      <GenerationForm onImageGenerated={handleImageGenerated} />
    </div>
  );
}