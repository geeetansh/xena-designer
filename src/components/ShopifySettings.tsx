import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, AlertCircle, Loader2, Trash2, ExternalLink } from 'lucide-react';
import { SiShopify } from "react-icons/si";

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
  getShopifyCredentials, 
  saveShopifyCredentials, 
  deleteShopifyCredentials,
  testShopifyConnection,
  ShopifyCredentials,
} from '@/services/shopifyService';
import { useToast } from '@/hooks/use-toast';

const shopifyFormSchema = z.object({
  store_url: z.string().min(1, 'Store URL is required'),
  storefront_access_token: z.string().min(1, 'Access token is required'),
});

export function ShopifySettings() {
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openHelpDialog, setOpenHelpDialog] = useState(false);
  const { toast } = useToast();

  const form = useForm<ShopifyCredentials>({
    resolver: zodResolver(shopifyFormSchema),
    defaultValues: {
      store_url: '',
      storefront_access_token: '',
    },
  });

  useEffect(() => {
    async function loadCredentials() {
      try {
        setLoading(true);
        const credentials = await getShopifyCredentials();
        
        if (credentials) {
          // Remove https:// from store_url if present
          let storeUrl = credentials.store_url;
          if (storeUrl.startsWith('https://')) {
            storeUrl = storeUrl.substring(8);
          } else if (storeUrl.startsWith('http://')) {
            storeUrl = storeUrl.substring(7);
          }
          
          form.reset({
            ...credentials,
            store_url: storeUrl
          });
          setIsConnected(true);
        }
      } catch (error) {
        console.error('Error loading credentials:', error);
        toast({
          title: 'Error',
          description: 'Failed to load Shopify credentials',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }
    
    loadCredentials();
  }, [form, toast]);

  const onSubmit = async (data: ShopifyCredentials) => {
    try {
      setSaving(true);
      
      // Add https:// prefix to store URL if not present
      let storeUrl = data.store_url;
      if (!storeUrl.match(/^https?:\/\//)) {
        storeUrl = `https://${storeUrl}`;
      }
      
      // Test the connection first
      const isValid = await testShopifyConnection({
        store_url: storeUrl,
        storefront_access_token: data.storefront_access_token
      });
      
      if (!isValid) {
        toast({
          title: 'Connection failed',
          description: 'Unable to connect to Shopify with these credentials. Please verify and try again.',
          variant: 'destructive',
        });
        return;
      }
      
      // Save credentials if connection is successful
      const success = await saveShopifyCredentials({
        store_url: storeUrl,
        storefront_access_token: data.storefront_access_token
      });
      
      if (success) {
        setIsConnected(true);
        toast({
          title: 'Success',
          description: 'Shopify credentials saved successfully',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to save Shopify credentials',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const formData = form.getValues();
      
      // Add https:// prefix to store URL if not present
      let storeUrl = formData.store_url;
      if (!storeUrl.match(/^https?:\/\//)) {
        storeUrl = `https://${storeUrl}`;
      }
      
      const isValid = await testShopifyConnection({
        store_url: storeUrl,
        storefront_access_token: formData.storefront_access_token
      });
      
      if (isValid) {
        toast({
          title: 'Connection successful',
          description: 'Successfully connected to your Shopify store',
        });
      } else {
        toast({
          title: 'Connection failed',
          description: 'Unable to connect to Shopify with these credentials',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Connection failed',
        description: 'An error occurred while testing the connection',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDeleting(true);
      const success = await deleteShopifyCredentials();
      
      if (success) {
        form.reset({
          store_url: '',
          storefront_access_token: '',
        });
        setIsConnected(false);
        toast({
          title: 'Success',
          description: 'Shopify store disconnected successfully',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to disconnect Shopify store',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error disconnecting store:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setOpenDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SiShopify className="h-6 w-6 text-[#7AB55C]" />
          Shopify Integration
        </CardTitle>
        <CardDescription>
          Connect your Shopify store to import product data and images
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isConnected && (
          <Alert className="mb-6 bg-primary/5">
            <CheckCircle className="h-4 w-4 text-primary" />
            <AlertTitle>Your Shopify store is connected</AlertTitle>
            <AlertDescription>
              You can now view your products in the Products tab
            </AlertDescription>
          </Alert>
        )}
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Enter your Shopify store URL (e.g., your-store.myshopify.com)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="storefront_access_token"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Storefront API Access Token</FormLabel>
                  <FormControl>
                    <Input 
                      type="password"
                      placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxx" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription className="flex items-center gap-1">
                    <span>Enter your Storefront API access token</span>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => setOpenHelpDialog(true)}
                    >
                      How to get this?
                    </Button>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex flex-wrap gap-2">
              <Button 
                type="submit" 
                disabled={saving || testing || deleting}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isConnected ? 'Update Connection' : 'Connect Shopify'}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={saving || testing || deleting}
              >
                {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
              
              {isConnected && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setOpenDeleteDialog(true)}
                  disabled={saving || testing || deleting}
                >
                  Disconnect Store
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
      
      {/* Delete confirmation dialog */}
      <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Shopify Store</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect your Shopify store? 
              This will remove your credentials from our system.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              variant="destructive" 
              onClick={handleDisconnect}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Help dialog */}
      <Dialog open={openHelpDialog} onOpenChange={setOpenHelpDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>How to Get Your Shopify Storefront API Access Token</DialogTitle>
            <DialogDescription>
              Follow these steps to create a Storefront API access token for your Shopify store
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">1. Log in to your Shopify admin</h3>
              <p className="text-sm text-muted-foreground">
                Go to your Shopify admin dashboard at your-store.myshopify.com/admin
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">2. Navigate to Apps and sales channels</h3>
              <p className="text-sm text-muted-foreground">
                In your Shopify admin, click on "Apps and sales channels" in the left sidebar
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">3. Go to App and sales channel settings</h3>
              <p className="text-sm text-muted-foreground">
                Click on "Settings" at the bottom of the sidebar, then select "App and sales channel settings"
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">4. Create a Storefront API access token</h3>
              <p className="text-sm text-muted-foreground">
                Click the "Develop apps" button, then "Create an app" and give it a name (e.g., "Xena Integration")
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">5. Configure API access</h3>
              <p className="text-sm text-muted-foreground">
                After creating the app, select "API credentials" and then "Configure Storefront API scopes"
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">6. Set required scopes</h3>
              <p className="text-sm text-muted-foreground">
                Select at minimum: "unauthenticated_read_product_listings" and "unauthenticated_read_product_inventory"
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">7. Create the token</h3>
              <p className="text-sm text-muted-foreground">
                Click "Save" and then "Install app". Copy the Storefront API access token that starts with "shpat_"
              </p>
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Keep your access token secure. It grants read access to your product data.
              </AlertDescription>
            </Alert>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                className="gap-1"
                onClick={() => window.open('https://shopify.dev/docs/api/storefront', '_blank')}
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