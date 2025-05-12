import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sparkles, CreditCard, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSubscriptionDetails, formatCurrency } from '@/services/stripeService';
import { getProductByPriceId } from '@/stripe-config';

export function SubscriptionBanner() {
  const [subscription, setSubscription] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [product, setProduct] = useState<any>(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    async function fetchSubscription() {
      try {
        setIsLoading(true);
        const subscriptionDetails = await getSubscriptionDetails();
        
        if (subscriptionDetails) {
          setSubscription(subscriptionDetails);
          
          if (subscriptionDetails.price_id) {
            const productDetails = getProductByPriceId(subscriptionDetails.price_id);
            setProduct(productDetails);
          }
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchSubscription();
  }, []);
  
  if (isLoading) {
    return (
      <Card className="p-3 md:p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs md:text-sm">Loading subscription details...</span>
      </Card>
    );
  }
  
  // If no subscription or not active, show upgrade banner
  if (!subscription || subscription.subscription_status !== 'active') {
    return (
      <Card className="p-3 md:p-4 bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
          <div className="flex items-center w-full md:w-auto">
            <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-primary mr-2" />
            <div>
              <h3 className="font-medium text-sm md:text-base">Upgrade to Premium</h3>
              <p className="text-xs text-muted-foreground line-clamp-2 md:line-clamp-1">Get 500 credits every month and unlock all features</p>
            </div>
          </div>
          <Button 
            onClick={() => navigate('/pricing')} 
            className="w-full md:w-auto text-xs md:text-sm h-8 md:h-9"
          >
            View Plans
          </Button>
        </div>
      </Card>
    );
  }
  
  // Show active subscription details
  return (
    <Card className="p-3 md:p-4 bg-gradient-to-r from-green-100/50 to-green-50/30 dark:from-green-900/20 dark:to-green-800/10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-4">
        <div className="flex items-center">
          <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-green-600 dark:text-green-400 mr-2" />
          <div>
            <h3 className="font-medium text-sm md:text-base">Active Subscription</h3>
            <p className="text-xs text-muted-foreground">
              {product ? (
                <>
                  {product.name} ({product.price}/month)
                  {subscription.payment_method_last4 && (
                    <span className="ml-2 hidden md:inline">
                      •••• {subscription.payment_method_last4}
                    </span>
                  )}
                </>
              ) : (
                'Premium plan'
              )}
            </p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground w-full md:w-auto mt-1 md:mt-0 text-right">
          {subscription.current_period_end && (
            <span>
              Next billing: {new Date(subscription.current_period_end * 1000).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}