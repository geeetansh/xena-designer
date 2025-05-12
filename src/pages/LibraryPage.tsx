import { useState } from 'react';
import { LibraryView } from '@/components/LibraryView';

export default function LibraryPage() {
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  const handleLibraryUpdated = () => {
    setRefreshCounter(prev => prev + 1);
  };
  
  return (
    <div className="max-w-6xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Assets Library</h1>
      <LibraryView onLibraryUpdated={handleLibraryUpdated} />
    </div>
  );
}