import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, Download } from 'lucide-react';
import { LazyImage } from '@/components/LazyImage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getImageEdits, EditedImage } from '@/services/imageEditService';

interface EditedImagesListProps {
  originalImageId: string;
  refreshTrigger?: number;
}

export function EditedImagesList({ originalImageId, refreshTrigger = 0 }: EditedImagesListProps) {
  const [edits, setEdits] = useState<EditedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  
  // Load edits when component mounts or refreshTrigger changes
  useEffect(() => {
    if (originalImageId) {
      loadEdits();
    }
  }, [originalImageId, refreshTrigger]);
  
  const loadEdits = async () => {
    try {
      setIsLoading(true);
      const editsData = await getImageEdits(originalImageId);
      setEdits(editsData);
    } catch (error) {
      console.error('Error loading image edits:', error);
      toast({
        title: 'Error',
        description: 'Failed to load edited images',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDownload = (imageUrl: string, index: number) => {
    try {
      // Create a download link
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = `edited-image-${index + 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      toast({
        title: 'Download started',
        description: 'Your image is being downloaded'
      });
    } catch (error) {
      console.error('Error downloading image:', error);
      toast({
        title: 'Download failed',
        description: 'Failed to download image',
        variant: 'destructive'
      });
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Loading edits...</span>
      </div>
    );
  }
  
  if (edits.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Edited Versions</h3>
      <div className="space-y-6">
        {edits.map((edit, index) => (
          <div key={edit.id} className="border rounded-lg overflow-hidden">
            <div className="flex justify-between items-center p-3 border-b bg-muted/30">
              <div className="flex items-center">
                <Badge variant={edit.status === 'completed' ? 'default' : 
                             edit.status === 'failed' ? 'destructive' : 'secondary'}>
                  {edit.status === 'processing' ? 'Processing' : 
                   edit.status === 'completed' ? 'Edited' : 'Failed'}
                </Badge>
                <span className="ml-2 text-sm text-muted-foreground">
                  {new Date(edit.created_at).toLocaleString()}
                </span>
              </div>
              {edit.status === 'completed' && edit.image_url && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDownload(edit.image_url!, index)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
            </div>
            
            <div className="p-3 text-sm">
              <strong>Edit instructions:</strong> {edit.prompt}
            </div>
            
            <div className="p-3 border-t">
              {edit.status === 'processing' ? (
                <div className="flex items-center justify-center h-64 bg-muted/10">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : edit.status === 'completed' && edit.image_url ? (
                <LazyImage
                  src={edit.image_url}
                  alt="Edited image"
                  className="w-full h-auto object-contain max-h-[500px]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 bg-destructive/10">
                  <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                  <span className="text-sm text-destructive">{edit.error_message || 'Failed to generate edit'}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}