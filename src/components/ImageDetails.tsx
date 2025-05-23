import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LazyImage } from '@/components/LazyImage';
import { Textarea } from "@/components/ui/textarea";
import { Download, Calendar, Loader2, Wand2, CheckCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { usePostHog } from '@/lib/posthog';
import { EditedImagesList } from './EditedImagesList';
import { 
  startImageEdit, 
  getEditStatus, 
  isMagicEditEnabled 
} from '@/services/imageEditService';

interface ImageDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: {
    id: string;
    image_url: string;
    status: string;
    prompt: string;
    created_at: string;
  } | null;
}

export function ImageDetails({ open, onOpenChange, image }: ImageDetailsProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();
  const { isFeatureEnabled } = usePostHog();
  
  // Magic Edit state variables
  const [editPrompt, setEditPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<any | null>(null);
  const [pollInterval, setPollInterval] = useState<number | null>(null);
  
  // Check if magic edit feature is enabled
  const magicEditEnabled = isFeatureEnabled('magic-editing', false);
  
  // Clear edit state when dialog closes
  useEffect(() => {
    if (!open) {
      setEditPrompt('');
      setIsSubmitting(false);
      setEditId(null);
      setEditStatus(null);
      
      // Clear any polling interval
      if (pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }
    }
  }, [open, pollInterval]);
  
  // Poll for status updates when an edit is in progress
  useEffect(() => {
    if (editId && !pollInterval) {
      // Set up polling for status updates
      const interval = setInterval(async () => {
        try {
          const status = await getEditStatus(editId);
          setEditStatus(status);
          
          // If the edit is complete or failed, stop polling
          if (status?.status === 'completed' || status?.status === 'failed') {
            clearInterval(interval);
            setPollInterval(null);
            
            if (status?.status === 'completed') {
              toast({
                title: "Edit complete",
                description: "Your image has been updated successfully"
              });
              
              handleEditSuccess();
            } else if (status?.status === 'failed') {
              toast({
                title: "Edit failed",
                description: status.error_message || "An unknown error occurred",
                variant: "destructive"
              });
            }
          }
        } catch (error) {
          console.error('Error polling for edit status:', error);
        }
      }, 2000);
      
      setPollInterval(interval);
      
      // Clean up interval on unmount
      return () => {
        clearInterval(interval);
      };
    }
  }, [editId, pollInterval, toast]);
  
  // Handler for download button
  const handleDownload = () => {
    if (!image?.image_url) return;
    
    try {
      const a = document.createElement('a');
      a.href = image.image_url;
      a.download = `generation-${image.id}.png`;
      document.body.appendChild(a);
      a.click();
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
  
  // Refresh edited images list when an edit is completed
  const handleEditSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };
  
  // Handle magic edit submission
  const handleSubmit = async () => {
    if (!image) return;
    
    if (!editPrompt.trim()) {
      toast({
        title: "Edit instructions required",
        description: "Please enter instructions for how to edit the image",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const id = await startImageEdit(image.id, image.image_url, editPrompt);
      setEditId(id);
      
      toast({
        title: "Edit started",
        description: "Your image edit has been started and will process in the background"
      });
    } catch (error) {
      console.error('Error starting image edit:', error);
      toast({
        title: "Edit failed to start",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!image) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] max-h-[900px] p-0 flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-2 border-b sticky top-0 bg-background z-10">
          <DialogTitle className="text-xl font-semibold">Image Details</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Image Preview */}
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden bg-muted/20">
                <LazyImage 
                  src={image.image_url} 
                  alt="Generated image"
                  className="w-full h-auto object-contain"
                />
              </div>
              
              <div className="flex justify-between">
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
            
            {/* Image Details and Edit section */}
            <div className="space-y-6">
              {/* Magic Edit section (only if enabled) */}
              {magicEditEnabled && (
                <div>
                  <h3 className="text-lg font-medium mb-2">Magic Edit</h3>
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Describe the changes you want to make..."
                    className="min-h-[100px] resize-none mb-2"
                    disabled={!!editId || isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground mb-3">
                    Be specific about what you want to change. For example: "Change the background to blue", "Make the product larger", etc.
                  </p>
                  
                  <div className="flex justify-between">
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting || !editPrompt.trim() || !!editId}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4 mr-2" />
                          Magic Edit
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {/* Editing status and result */}
                  {editStatus && (
                    <div className="mt-4 border p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium">Edit Status</h4>
                        <Badge variant={editStatus.status === 'completed' ? 'default' : 
                              editStatus.status === 'failed' ? 'destructive' : 'secondary'}>
                          {editStatus.status === 'processing' ? (
                            <span className="flex items-center">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Processing
                            </span>
                          ) : editStatus.status === 'completed' ? (
                            <span className="flex items-center">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completed
                            </span>
                          ) : (
                            <span className="flex items-center">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Failed
                            </span>
                          )}
                        </Badge>
                      </div>
                      
                      {editStatus.status === 'processing' ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : editStatus.status === 'failed' && editStatus.error_message ? (
                        <p className="text-sm text-destructive">{editStatus.error_message}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {/* Image status section */}
              <div>
                <h3 className="text-lg font-medium mb-2">Status</h3>
                <div className="flex items-center">
                  <Badge 
                    variant={image.status === 'completed' ? 'default' : 
                            image.status === 'failed' ? 'destructive' : 
                            'secondary'}
                  >
                    {image.status}
                  </Badge>
                  <span className="ml-2 text-sm text-muted-foreground flex items-center">
                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                    {format(new Date(image.created_at), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              </div>
              
              {/* Edited Images List */}
              {magicEditEnabled && (
                <EditedImagesList 
                  originalImageId={image.id} 
                  refreshTrigger={refreshTrigger} 
                />
              )}
            </div>
          </div>
        </div>
        
        <DialogFooter className="px-4 py-3 border-t">
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}