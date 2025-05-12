import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RawJsonView } from '@/components/RawJsonView';
import { Button } from '@/components/ui/button';
import { RefreshCw, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LogsPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchParams] = useSearchParams();
  const imageId = searchParams.get('imageId');
  const navigate = useNavigate();

  // Reset selected image when component unmounts
  useEffect(() => {
    return () => {
      // This cleanup function runs when the component unmounts
    };
  }, []);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold">API Response Logs</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/gallery')}
            className="h-8 md:h-9 text-xs md:text-sm"
          >
            <LayoutDashboard className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1 md:mr-2" />
            Back to Gallery
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="h-8 md:h-9 text-xs md:text-sm"
          >
            <RefreshCw className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1 md:mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <RawJsonView refreshTrigger={refreshTrigger} selectedImageId={imageId} />
    </div>
  );
}