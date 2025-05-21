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
import { Download, Calendar, Wand2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { usePostHog } from '@/lib/posthog';
import { ImageEditDialog } from './ImageEditDialog';
import { EditedImagesList } from './EditedImagesList';

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
  const [isImageEditOpen, setIsImageEditOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();
  const { isFeatureEnabled } = usePostHog();
  
  // Check if magic edit feature is enabled
  const magicEditEnabled = isFeatureEnabled('magic-editing', false);
  
  // Close image edit modal when main dialog closes
  useEffect(() => {
    if (!open) {
      setIsImageEditOpen(false);
    }
  }, [open]);
  
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
  
  if (!image) return null;
  
  return (
    <>
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
                  
                  {magicEditEnabled && (
                    <Button 
                      onClick={() => setIsImageEditOpen(true)}
                      variant="secondary"
                    >
                      <Wand2 className="h-4 w-4 mr-2" />
                      Magic Edit
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Image Details */}
              <div className="space-y-6">
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
      
      {/* Magic Edit Dialog */}
      {magicEditEnabled && (
        <ImageEditDialog
          open={isImageEditOpen}
          onOpenChange={setIsImageEditOpen}
          originalImageId={image.id}
          originalImageUrl={image.image_url}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  );
}