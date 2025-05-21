import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ShopifySettings } from '@/components/ShopifySettings';
import { ShopifyAdminSettings } from '@/components/ShopifyAdminSettings';
import { UserProfileForm } from '@/components/UserProfileForm';
import { InstructionsSettings } from '@/components/InstructionsSettings';
import { SubscriptionSettings } from '@/components/SubscriptionSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { usePostHog } from '@/lib/posthog';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const location = useLocation();
  const { posthog } = usePostHog();
  const [showNewShopifyIntegration, setShowNewShopifyIntegration] = useState(false);
  
  // Check if there's a tab parameter in the URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get('tab');
    if (tab && ['general', 'shopify', 'instructions', 'subscription'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [location]);
  
  // Check feature flag
  useEffect(() => {
    if (posthog) {
      const hasFeatureFlag = posthog.isFeatureEnabled('new-shopify-integration');
      setShowNewShopifyIntegration(hasFeatureFlag);
    }
  }, [posthog]);

  return (
    <div className="max-w-4xl mx-auto w-full py-8">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
          <TabsTrigger value="instructions">Instructions</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general">
          <div className="space-y-6">
            {/* User Profile Form */}
            <UserProfileForm />
          </div>
        </TabsContent>
        
        <TabsContent value="shopify">
          <div className="space-y-6">
            {/* Current Shopify Integration (Storefront API) */}
            <ShopifySettings />
            
            {/* New Shopify Integration with Admin API (feature flagged) */}
            {showNewShopifyIntegration && (
              <>
                <Separator className="my-8" />
                <ShopifyAdminSettings />
              </>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="instructions">
          <InstructionsSettings />
        </TabsContent>
        
        <TabsContent value="subscription">
          <SubscriptionSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}