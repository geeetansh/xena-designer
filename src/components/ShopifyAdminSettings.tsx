import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, AlertCircle, Loader2, Trash2, ExternalLink, ShoppingBag } from 'lucide-react';
import { SiShopify } from "react-icons/si";
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { trackEvent } from '@/lib/posthog';

// Client ID and secret for Shopify Partner app
const SHOPIFY_CLIENT_ID = 'db9730b7e04047c0dc78b4e9e9268083';
const SHOPIFY_CLIENT_SECRET = 'd8b050cca3271d9c2d2a5ae8e57151d6';
const SHOPIFY_API_VERSION = '2025-04';

const adminSettingsSchema = z.object({
  store_url: z.string().min(1, 'Store URL is required'),
});

interface ShopifyAdminCredentials {
  store_url: string;
  access_token?: string;
  shop_name?: string;
  scopes?: string;
  connected_at?: string;
}

interface ShopProductsResponse {
  data: {
    products: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          handle: string;
          description: string;
          images: {
            edges: Array<{
              node: {
                id: string;
                url: string;
              }
            }>
          }
        }
      }>
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string;
      }
    }
  }
}

export function ShopifyAdminSettings() {
  const [loading, setLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [openHelpDialog, setOpenHelpDialog] = useState(false);
  const [credentials, setCredentials] = useState<ShopifyAdminCredentials | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSampleProducts, setShowSampleProducts] = useState(false);
  const [sampleProducts, setSampleProducts] = useState<any[]>([]);
  const [isFetchingProducts, setIsFetchingProducts] = useState(false);
  
  const { toast } = useToast();

  const form = useForm<ShopifyAdminCredentials>({
    resolver: zodResolver(adminSettingsSchema),
    defaultValues: {
      store_url: '',
    },
  });

  // Load credentials on component mount
  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setErrorMessage('User not authenticated');
        setLoading(false);
        return;
      }
      
      // Query for admin credentials in a new table
      const { data, error } = await supabase
        .from('shopify_admin_credentials')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching Shopify Admin credentials:', error);
        // If the table doesn't exist yet, that's ok
        if (error.code !== 'PGRST116') { // Not found error
          setErrorMessage(error.message);
        }
      } else if (data) {
        // Store is connected
        setCredentials(data);
        setIsConnected(true);
        
        // Set the form values
        form.reset({
          store_url: data.store_url,
        });
        
        // Track the connected state
        trackEvent('shopify_admin_connection_loaded', {
          is_connected: true,
          shop_name: data.shop_name
        });
      }
    } catch (error) {
      console.error('Error in loadCredentials:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  // Generate a random state value and store it in localStorage
  const generateStateParam = () => {
    const state = uuidv4();
    localStorage.setItem('shopify_oauth_state', state);
    return state;
  };

  // Generate HMAC signature for verifying callbacks
  const generateHmac = (params: Record<string, string>, secret: string) => {
    // Sort keys alphabetically
    const sortedKeys = Object.keys(params).sort();
    
    // Create a string of key=value pairs
    const queryString = sortedKeys
      .filter(key => key !== 'hmac' && key !== 'signature') // Exclude hmac and signature
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    // Generate HMAC
    return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
  };

  // Verify the HMAC from Shopify
  const verifyHmac = (queryParams: URLSearchParams) => {
    const hmac = queryParams.get('hmac');
    if (!hmac) return false;
    
    // Convert query params to object
    const params: Record<string, string> = {};
    queryParams.forEach((value, key) => {
      params[key] = value;
    });
    
    // Generate our own HMAC
    const calculatedHmac = generateHmac(params, SHOPIFY_CLIENT_SECRET);
    
    // Compare HMACs
    return hmac === calculatedHmac;
  };

  // Start the OAuth process
  const handleInstallApp = async () => {
    try {
      setIsInstalling(true);
      setErrorMessage(null);
      
      // Validate store URL
      const storeUrl = form.getValues('store_url').trim();
      if (!storeUrl) {
        form.setError('store_url', { message: 'Store URL is required' });
        return;
      }
      
      // Clean up the store URL
      let normalizedUrl = storeUrl;
      if (!normalizedUrl.startsWith('http')) {
        normalizedUrl = `https://${normalizedUrl}`;
      }
      
      // Remove trailing slash
      if (normalizedUrl.endsWith('/')) {
        normalizedUrl = normalizedUrl.slice(0, -1);
      }
      
      // Extract the shop domain
      let shopDomain;
      try {
        const url = new URL(normalizedUrl);
        shopDomain = url.hostname;
      } catch (error) {
        console.error('Invalid URL:', error);
        form.setError('store_url', { message: 'Invalid store URL' });
        return;
      }
      
      // Generate a state value for security
      const state = generateStateParam();
      
      // Define the required scopes
      const scopes = [
        'read_products',
        'read_product_listings',
        'read_inventory',
        'read_orders',
        'read_customers'
      ].join(',');
      
      // Construct the installation URL
      const redirectUri = encodeURIComponent(`${window.location.origin}/auth/callback`);
      const installUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
      
      // Track the installation attempt
      trackEvent('shopify_admin_install_started', {
        shop_domain: shopDomain
      });
      
      // Redirect to Shopify OAuth page
      window.location.href = installUrl;
      
    } catch (error) {
      console.error('Error installing Shopify app:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      
      toast({
        title: 'Installation Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
      
      trackEvent('shopify_admin_install_error', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsInstalling(false);
    }
  };

  // Handle OAuth callback
  const handleOAuthCallback = async (code: string, shop: string, state: string) => {
    try {
      // Verify state parameter
      const savedState = localStorage.getItem('shopify_oauth_state');
      if (!savedState || savedState !== state) {
        throw new Error('Invalid state parameter');
      }
      
      // Clear the state from localStorage
      localStorage.removeItem('shopify_oauth_state');
      
      // Exchange authorization code for access token
      const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: SHOPIFY_CLIENT_ID,
          client_secret: SHOPIFY_CLIENT_SECRET,
          code: code
        })
      });
      
      if (!tokenResponse.ok) {
        throw new Error(`Failed to get access token: ${tokenResponse.statusText}`);
      }
      
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      const grantedScopes = tokenData.scope;
      
      // Get shop information
      const shopInfoResponse = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      });
      
      if (!shopInfoResponse.ok) {
        throw new Error(`Failed to get shop info: ${shopInfoResponse.statusText}`);
      }
      
      const shopInfo = await shopInfoResponse.json();
      const shopName = shopInfo.shop.name;
      
      // Save the credentials to the database
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const { error: upsertError } = await supabase
        .from('shopify_admin_credentials')
        .upsert({
          user_id: user.id,
          store_url: shop,
          access_token: accessToken,
          scopes: grantedScopes,
          shop_name: shopName,
          connected_at: new Date().toISOString()
        });
      
      if (upsertError) {
        throw new Error(`Failed to save credentials: ${upsertError.message}`);
      }
      
      // Update local state
      setCredentials({
        store_url: shop,
        access_token: accessToken,
        scopes: grantedScopes,
        shop_name: shopName,
        connected_at: new Date().toISOString()
      });
      
      setIsConnected(true);
      
      toast({
        title: 'Connection Successful',
        description: `Successfully connected to ${shopName}`,
      });
      
      trackEvent('shopify_admin_connected', {
        shop_name: shopName
      });
      
      // Update form
      form.reset({
        store_url: shop
      });
      
    } catch (error) {
      console.error('Error handling OAuth callback:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
      
      trackEvent('shopify_admin_callback_error', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Check for OAuth callback params on component mount
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const code = queryParams.get('code');
    const shop = queryParams.get('shop');
    const state = queryParams.get('state');
    
    if (code && shop && state) {
      handleOAuthCallback(code, shop, state);
      
      // Remove the query params from the URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  // Disconnect the app
  const handleUninstallApp = async () => {
    try {
      setIsUninstalling(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Delete the credentials from the database
      const { error } = await supabase
        .from('shopify_admin_credentials')
        .delete()
        .eq('user_id', user.id);
      
      if (error) {
        throw new Error(`Failed to delete credentials: ${error.message}`);
      }
      
      // Reset state
      setCredentials(null);
      setIsConnected(false);
      
      // Reset form
      form.reset({
        store_url: ''
      });
      
      toast({
        title: 'App Disconnected',
        description: 'Successfully disconnected from Shopify',
      });
      
      trackEvent('shopify_admin_disconnected');
      
    } catch (error) {
      console.error('Error uninstalling Shopify app:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsUninstalling(false);
    }
  };

  // Fetch sample products
  const fetchSampleProducts = async () => {
    if (!credentials?.access_token || !credentials?.store_url) {
      setErrorMessage('No Shopify connection available');
      return;
    }
    
    try {
      setIsFetchingProducts(true);
      setSampleProducts([]);
      
      // GraphQL query to get products
      const query = `
        query {
          products(first: 5) {
            edges {
              node {
                id
                title
                handle
                description
                images(first: 1) {
                  edges {
                    node {
                      id
                      url
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;
      
      // Call the Admin API
      const shopDomain = credentials.store_url;
      const apiUrl = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': credentials.access_token
        },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.statusText}`);
      }
      
      const responseData: ShopProductsResponse = await response.json();
      
      // Extract products
      const products = responseData.data.products.edges.map(edge => edge.node);
      setSampleProducts(products);
      setShowSampleProducts(true);
      
      trackEvent('shopify_admin_products_fetched', {
        product_count: products.length
      });
      
    } catch (error) {
      console.error('Error fetching products:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingProducts(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SiShopify className="h-6 w-6 text-[#7AB55C]" />
            Shopify Admin Integration (New)
          </CardTitle>
          <CardDescription>
            Connect your Shopify store with admin permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SiShopify className="h-6 w-6 text-[#7AB55C]" />
          Shopify Admin Integration (New)
        </CardTitle>
        <CardDescription>
          Connect your Shopify store with admin permissions for enhanced features
        </CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        {isConnected && credentials && (
          <Alert className="mb-6 bg-primary/5">
            <CheckCircle className="h-4 w-4 text-primary" />
            <AlertTitle>Your Shopify store is connected</AlertTitle>
            <AlertDescription>
              Connected to {credentials.shop_name || credentials.store_url}
            </AlertDescription>
          </Alert>
        )}
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleInstallApp)} className="space-y-4">
            <FormField
              control={form.control}
              name="store_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shopify Store URL</FormLabel>
                  <FormControl>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                        https://
                      </span>
                      <Input 
                        placeholder="your-store.myshopify.com" 
                        {...field}
                        className="rounded-l-none" 
                        disabled={isConnected}
                      />
                    </div>
                  </FormControl>
                  <FormDescription className="flex items-center">
                    <span>Enter your Shopify store URL</span>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs ml-1"
                      onClick={() => setOpenHelpDialog(true)}
                    >
                      How does this work?
                    </Button>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex flex-wrap gap-2">
              {!isConnected ? (
                <Button 
                  type="submit" 
                  disabled={isInstalling}
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <SiShopify className="mr-2 h-4 w-4" />
                      Connect with Shopify
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={fetchSampleProducts}
                    disabled={isFetchingProducts}
                  >
                    {isFetchingProducts ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ShoppingBag className="mr-2 h-4 w-4" />
                    )}
                    View Sample Products
                  </Button>
                  
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleUninstallApp}
                    disabled={isUninstalling}
                  >
                    {isUninstalling ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Disconnect Store
                  </Button>
                </>
              )}
            </div>
          </form>
        </Form>
        
        {/* Sample Products Section */}
        {showSampleProducts && sampleProducts.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-medium mb-4">Sample Products from Your Store</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {sampleProducts.map((product) => (
                <Card key={product.id} className="overflow-hidden">
                  <div className="aspect-square relative bg-muted">
                    {product.images?.edges[0]?.node ? (
                      <img 
                        src={product.images.edges[0].node.url}
                        alt={product.title}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full">
                        <ShoppingBag className="h-12 w-12 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h4 className="font-medium text-base line-clamp-1">{product.title}</h4>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {product.description || 'No description available'}
                    </p>
                  </CardContent>
                  <CardFooter className="p-4 pt-0 flex justify-between">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">View Details</Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <div className="space-y-2">
                          <h4 className="font-medium">{product.title}</h4>
                          <p className="text-sm">{product.description || 'No description'}</p>
                          <Button 
                            variant="link" 
                            size="sm" 
                            className="p-0 h-auto"
                            onClick={() => window.open(`https://${credentials?.store_url}/admin/products/${product.handle}`, '_blank')}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            View in Shopify
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      
      {/* Help Dialog */}
      <Dialog open={openHelpDialog} onOpenChange={setOpenHelpDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>How Shopify Admin Integration Works</DialogTitle>
            <DialogDescription>
              This integration connects your store using OAuth for secure access to your Shopify admin
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">What You'll Get With This Integration</h3>
              <ul className="text-sm space-y-1 list-disc ml-5">
                <li>Access to all your products, orders, and customers</li>
                <li>Ability to perform advanced operations not available with the Storefront API</li>
                <li>Enhanced product data including inventory, pricing, and variants</li>
                <li>Full access to product images and media</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">How It Works</h3>
              <ol className="text-sm space-y-1 list-decimal ml-5">
                <li>Enter your Shopify store URL (e.g., your-store.myshopify.com)</li>
                <li>Click "Connect with Shopify" to be redirected to Shopify's authorization page</li>
                <li>Review and approve the requested permissions in your Shopify admin</li>
                <li>After approval, you'll be redirected back to this app</li>
                <li>Your store will be connected and ready to use</li>
              </ol>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Security</h3>
              <p className="text-sm">
                We use OAuth 2.0 for secure authentication. Your store credentials are encrypted and
                stored securely. You can revoke access at any time from your Shopify admin or by
                clicking the "Disconnect Store" button.
              </p>
            </div>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                className="gap-1"
                onClick={() => window.open('https://shopify.dev/docs/api/admin', '_blank')}
              >
                Shopify Documentation <ExternalLink className="h-4 w-4" />
              </Button>
              
              <DialogClose asChild>
                <Button>Close</Button>
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}