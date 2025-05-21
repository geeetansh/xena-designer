import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, AlertCircle, Wand2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { LazyImage } from '@/components/LazyImage';
import { useToast } from '@/hooks/use-toast';
import { 
  startImageEdit, 
  getEditStatus, 
  isMagicEditEnabled,
  EditedImage
} from '@/services/imageEditService';

interface ImageEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalImageId: string;
  originalImageUrl: string;
  onSuccess?: () => void;
}

export function ImageEditDialog({
  open,
  onOpenChange,
  originalImageId,
  originalImageUrl,
  onSuccess
}: ImageEditDialogProps) {
  const [editPrompt, setEditPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<EditedImage | null>(null);
  const [pollInterval, setPollInterval] = useState<number | null>(null);
  const { toast } = useToast();
  
  // Check if feature is enabled
  const isFeatureEnabled = isMagicEditEnabled();
  
  // Clear state when dialog is opened or closed
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
              
              if (onSuccess) {
                onSuccess();
              }
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
  }, [editId, pollInterval, toast, onSuccess]);
  
  const handleSubmit = async () => {
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
      const id = await startImageEdit(originalImageId, originalImageUrl, editPrompt);
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

  // If feature is not enabled, show a message
  if (!isFeatureEnabled) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Feature Unavailable</DialogTitle>
            <DialogDescription>
              The Magic Edit feature is not currently available for your account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-center text-sm text-muted-foreground">
              This feature is currently in beta. Please check back later.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Magic Edit</DialogTitle>
          <DialogDescription>
            Describe how you want to modify this image and we'll generate a new version for you.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          {/* Original image preview */}
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2">Original Image</h3>
            <div className="border rounded-md overflow-hidden">
              <LazyImage
                src={originalImageUrl}
                alt="Original image"
                className="w-full h-auto object-contain"
              />
            </div>
          </div>
          
          {/* Edit prompt input */}
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2">Edit Instructions</h3>
            <Textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="Describe the changes you want to make..."
              className="min-h-[100px] resize-none"
              disabled={!!editId || isSubmitting}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Be specific about what you want to change. For example: "Change the background to blue", "Make the product larger", etc.
            </p>
          </div>
          
          {/* Editing status and result */}
          {editStatus && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Edited Image</h3>
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
                <div className="border rounded-md p-12 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : editStatus.status === 'completed' && editStatus.image_url ? (
                <div className="border rounded-md overflow-hidden">
                  <LazyImage
                    src={editStatus.image_url}
                    alt="Edited image"
                    className="w-full h-auto object-contain"
                  />
                </div>
              ) : editStatus.status === 'failed' ? (
                <div className="border rounded-md p-8 flex flex-col items-center justify-center bg-destructive/10">
                  <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                  <p className="text-sm text-center text-destructive">
                    {editStatus.error_message || "Failed to edit image"}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </DialogClose>
          
          {!editId && (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !editPrompt.trim()}
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
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}