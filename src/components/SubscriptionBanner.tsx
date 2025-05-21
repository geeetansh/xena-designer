import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sparkles, Coins, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUserCredits } from '@/services/stripeService';

export function SubscriptionBanner() {
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  
  useEffect(() => {
    async function fetchCredits() {
      try {
        setIsLoading(true);
        const credits = await getUserCredits();
        setCredits(credits);
      } catch (error) {
        console.error('Error fetching credits:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchCredits();
  }, []);
  
  if (isLoading) {
    return (
      <Card className="p-3 md:p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs md:text-sm">Loading credits...</span>
      </Card>
    );
  }
  
  return (
    <Card className="p-3 md:p-4 bg-gradient-to-r from-primary/10 to-primary/5">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
        <div className="flex items-center w-full md:w-auto">
          <Coins className="h-4 w-4 md:h-5 md:w-5 text-primary mr-2" />
          <div>
            <h3 className="font-medium text-sm md:text-base">Your credits: {credits || 0}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2 md:line-clamp-1">Purchase more credits to create more images</p>
          </div>
        </div>
        <Button 
          onClick={() => navigate('/pricing')} 
          className="w-full md:w-auto text-xs md:text-sm h-8 md:h-9"
        >
          <Sparkles className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
          Get More Credits
        </Button>
      </div>
    </Card>
  );
}