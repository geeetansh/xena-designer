import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Loader2, Coins, ArrowRight } from 'lucide-react';
import { getUserOrders } from '@/services/stripeService';
import { getProductByPriceId } from '@/stripe-config';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/posthog';

export default function CheckoutSuccessPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [product, setProduct] = useState<any>(null);
  const [currentCredits, setCurrentCredits] = useState<number | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    async function fetchCheckoutDetails() {
      try {
        setIsLoading(true);
        
        // Get the most recent order
        const orders = await getUserOrders();
        
        if (orders && orders.length > 0) {
          // Get the most recent order
          const mostRecentOrder = orders[0];
          setOrder(mostRecentOrder);
          
          // If the order has a product_id, try to get product details
          if (mostRecentOrder.product_id) {
            const productDetails = getProductByPriceId(mostRecentOrder.product_id);
            if (productDetails) {
              setProduct(productDetails);
            }
          }
          
          // Track successful purchase
          trackEvent('purchase_completed', {
            order_id: mostRecentOrder.order_id,
            amount: mostRecentOrder.amount_total / 100,
            credits: mostRecentOrder.credits_added || 0
          });
        }
        
        // Get user's current credits
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('credits')
            .eq('user_id', user.id)
            .single();
            
          if (data) {
            setCurrentCredits(data.credits);
          }
        }
      } catch (error) {
        console.error('Error fetching checkout details:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchCheckoutDetails();
  }, []);
  
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="py-4 px-4 md:px-6 border-b">
        <div className="container mx-auto flex items-center justify-center">
          <img 
            src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6810f7c3918810c7e1a3fb13_Xena.png" 
            alt="Xena Logo" 
            className="h-8 w-auto" 
          />
        </div>
      </header>

      <main className="flex-1 py-8 md:py-12 px-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 bg-green-100 p-3 rounded-full w-14 h-14 md:w-16 md:h-16 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
            </div>
            <CardTitle className="text-xl md:text-2xl">Payment Successful!</CardTitle>
            <CardDescription>
              Thank you for your purchase. Your credits have been added to your account.
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-6 md:py-8">
                <Loader2 className="h-6 w-6 md:h-8 md:w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-muted p-3 md:p-4 rounded-lg">
                  <h3 className="text-sm md:font-medium mb-2">Purchase Details</h3>
                  {order ? (
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">Product:</span> {' '}
                        {product?.name || order.product_name || 'Credits Purchase'}
                      </p>
                      <p className="flex items-center">
                        <span className="text-muted-foreground mr-2">Credits Added:</span>
                        <Coins className="h-3 w-3 md:h-4 md:w-4 text-amber-500 mr-1" />
                        <span>{order.credits_added || product?.credits || '-'}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Amount:</span> {' '}
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: order.currency?.toUpperCase() || 'USD'
                        }).format(order.amount_total / 100)}
                      </p>
                      {currentCredits !== null && (
                        <p className="font-medium mt-3 pt-2 border-t">
                          <span className="text-muted-foreground">Current balance:</span> {' '}
                          {currentCredits} credits
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm">Your purchase has been completed. Your credits have been added to your account.</p>
                  )}
                </div>
                
                <div className="bg-primary/5 p-3 md:p-4 rounded-lg">
                  <h3 className="text-sm md:font-medium mb-2">What's Next?</h3>
                  <p className="text-xs md:text-sm">
                    You can now start using your credits to generate amazing images. Head to the dashboard to get started.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex justify-center pt-2 md:pt-4">
            <Button 
              onClick={() => navigate('/photoshoot')} 
              className="w-full md:w-auto"
            >
              Start Creating
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </main>
      
      <footer className="py-4 md:py-6 px-4 border-t">
        <div className="container mx-auto text-center text-xs md:text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Xena AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}