import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CreditCard, CheckCircle, AlertCircle, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUserSubscription, getUserOrders, formatCurrency } from '@/services/stripeService';
import { getProductByPriceId } from '@/stripe-config';
import { useToast } from '@/hooks/use-toast';

export function SubscriptionSettings() {
  const [subscription, setSubscription] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [product, setProduct] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  useEffect(() => {
    async function fetchSubscriptionAndOrders() {
      try {
        setIsLoading(true);
        
        // Fetch subscription
        const subscriptionData = await getUserSubscription();
        setSubscription(subscriptionData);
        
        if (subscriptionData?.price_id) {
          const productDetails = getProductByPriceId(subscriptionData.price_id);
          setProduct(productDetails);
        }
        
        // Fetch orders
        const ordersData = await getUserOrders();
        setOrders(ordersData || []);
      } catch (error) {
        console.error('Error fetching subscription data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load subscription information',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchSubscriptionAndOrders();
  }, [toast]);
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full text-xs">
            <CheckCircle className="h-3 w-3 mr-1" />
            Active
          </div>
        );
      case 'canceled':
      case 'incomplete_expired':
        return (
          <div className="flex items-center text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            Canceled
          </div>
        );
      case 'past_due':
        return (
          <div className="flex items-center text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            Past Due
          </div>
        );
      default:
        return (
          <div className="flex items-center text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full text-xs">
            {status || 'Unknown'}
          </div>
        );
    }
  };
  
  // Function to render the mobile version of the order history
  const renderMobileOrderHistory = () => {
    if (orders.length === 0) {
      return (
        <div className="bg-muted/30 p-4 rounded-lg border text-center">
          <p className="text-muted-foreground">No billing history available</p>
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
                  {order.product_name || getProductByPriceId(order.product_id)?.name || 'Unknown Product'}
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
          <p className="text-muted-foreground">No billing history available</p>
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
                  {order.product_name || getProductByPriceId(order.product_id)?.name || 'Unknown Product'}
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
          <CardTitle>Subscription & Billing</CardTitle>
          <CardDescription>
            Manage your subscription and view your billing history
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
          <CardTitle>Subscription & Billing</CardTitle>
          <CardDescription>
            Manage your subscription and view your billing history
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Subscription */}
          <div>
            <h3 className="text-lg font-medium mb-4">Current Plan</h3>
            
            {subscription && subscription.subscription_status === 'active' ? (
              <div className="bg-muted/30 p-4 rounded-lg border">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <h4 className="font-medium">
                        {product ? product.name : 'Premium Subscription'}
                      </h4>
                      <div className="w-full md:w-auto md:ml-auto">
                        {getStatusBadge(subscription.subscription_status)}
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="text-muted-foreground">Price:</span> {product ? product.price : '$199.00'}/month
                      </p>
                      {product && (
                        <p>
                          <span className="text-muted-foreground">Credits:</span> {product.credits} per month
                        </p>
                      )}
                      {subscription.current_period_end && (
                        <p>
                          <span className="text-muted-foreground">Next billing date:</span> {' '}
                          {new Date(subscription.current_period_end * 1000).toLocaleDateString()}
                        </p>
                      )}
                      {subscription.payment_method_last4 && (
                        <p>
                          <span className="text-muted-foreground">Payment method:</span> {' '}
                          {subscription.payment_method_brand} •••• {subscription.payment_method_last4}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center md:self-center">
                    <Button variant="outline" size="sm" onClick={() => navigate('/pricing')} className="w-full md:w-auto">
                      Manage Subscription
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted/30 p-4 rounded-lg border">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div>
                    <h4 className="font-medium mb-2">No active subscription</h4>
                    <p className="text-sm text-muted-foreground">
                      You don't have an active subscription. Upgrade to get more credits every month.
                    </p>
                  </div>
                  
                  <div className="flex items-center">
                    <Button onClick={() => navigate('/pricing')} className="w-full md:w-auto">
                      View Plans
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Order History */}
          <div>
            <h3 className="text-lg font-medium mb-4">Billing History</h3>
            
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
          <Button variant="outline" onClick={() => navigate('/pricing')} className="w-full md:w-auto">
            View Pricing Plans
          </Button>
          <Button onClick={() => navigate('/pricing')} className="w-full md:w-auto">
            Get More Credits
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}