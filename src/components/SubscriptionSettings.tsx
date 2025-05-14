import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CreditCard, CheckCircle, AlertCircle, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUserSubscription, getUserOrders, formatCurrency, getUserCredits } from '@/services/stripeService';
import { getProductByPriceId } from '@/stripe-config';
import { useToast } from '@/hooks/use-toast';

export function SubscriptionSettings() {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentCredits, setCurrentCredits] = useState<number | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  useEffect(() => {
    async function fetchSubscriptionAndOrders() {
      try {
        setIsLoading(true);
        
        // Fetch orders
        const ordersData = await getUserOrders();
        setOrders(ordersData || []);
        
        // Fetch user's current credits
        const credits = await getUserCredits();
        setCurrentCredits(credits);
      } catch (error) {
        console.error('Error fetching subscription data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load account information',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchSubscriptionAndOrders();
  }, [toast]);
  
  // Function to render the mobile version of the order history
  const renderMobileOrderHistory = () => {
    if (orders.length === 0) {
      return (
        <div className="bg-muted/30 p-4 rounded-lg border text-center">
          <p className="text-muted-foreground">No purchase history available</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order.order_id} className="border rounded-lg p-3 bg-card">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-sm">
                  {order.product_name || getProductByPriceId(order.product_id)?.name || 'Credit Purchase'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(order.order_date).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-sm">
                  {formatCurrency(order.amount_total, order.currency)}
                </p>
                <p className="text-xs capitalize">
                  {order.payment_status}
                </p>
              </div>
            </div>
            
            {order.credits_added && (
              <div className="mt-2 flex items-center text-xs">
                <Coins className="h-3 w-3 text-amber-500 mr-1" />
                <span>{order.credits_added} credits added</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  // Function to render the desktop version of the order history
  const renderDesktopOrderHistory = () => {
    if (orders.length === 0) {
      return (
        <div className="bg-muted/30 p-4 rounded-lg border text-center">
          <p className="text-muted-foreground">No purchase history available</p>
        </div>
      );
    }
    
    return (
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Product</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Amount</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Credits Added</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((order) => (
              <tr key={order.order_id} className="hover:bg-muted/20">
                <td className="px-4 py-3 text-sm">
                  {new Date(order.order_date).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm">
                  {/* Use product_name from the database if available, otherwise fall back to lookup */}
                  {order.product_name || getProductByPriceId(order.product_id)?.name || 'Credit Purchase'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {formatCurrency(order.amount_total, order.currency)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {order.credits_added ? (
                    <div className="flex items-center">
                      <Coins className="h-3.5 w-3.5 text-amber-500 mr-1.5" />
                      <span>{order.credits_added}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      {getProductByPriceId(order.product_id)?.credits || '-'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="capitalize">{order.payment_status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing & Credits</CardTitle>
          <CardDescription>
            Manage your credits and view your purchase history
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Billing & Credits</CardTitle>
          <CardDescription>
            Manage your credits and view your purchase history
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Credit Balance */}
          <div>
            <h3 className="text-lg font-medium mb-4">Current Credits</h3>
            
            <div className="bg-muted/30 p-4 rounded-lg border">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="h-5 w-5 text-primary" />
                    <h4 className="font-medium">
                      {currentCredits !== null ? currentCredits : 0} Credits Available
                    </h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Each credit allows you to generate one image variation.
                  </p>
                </div>
                
                <div className="flex items-center md:self-center">
                  <Button onClick={() => navigate('/pricing')} className="w-full md:w-auto">
                    Get More Credits
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Order History */}
          <div>
            <h3 className="text-lg font-medium mb-4">Purchase History</h3>
            
            {/* Mobile view for order history */}
            <div className="md:hidden">
              {renderMobileOrderHistory()}
            </div>
            
            {/* Desktop view for order history */}
            <div className="hidden md:block">
              {renderDesktopOrderHistory()}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col md:flex-row justify-between gap-3 border-t pt-6">
          <Button variant="outline" onClick={() => navigate('/home')} className="w-full md:w-auto">
            Back to Dashboard
          </Button>
          <Button onClick={() => navigate('/pricing')} className="w-full md:w-auto">
            <Coins className="h-4 w-4 mr-2" />
            Get More Credits
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}