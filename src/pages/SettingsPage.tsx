import { ShopifySettings } from '@/components/ShopifySettings';
import { UserProfileForm } from '@/components/UserProfileForm';
import { InstructionsSettings } from '@/components/InstructionsSettings';
import { SubscriptionSettings } from '@/components/SubscriptionSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const location = useLocation();
  
  // Check if there's a tab parameter in the URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get('tab');
    if (tab && ['general', 'shopify', 'instructions', 'subscription'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [location]);

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
            <UserProfileForm />
          </div>
        </TabsContent>
        
        <TabsContent value="shopify">
          <ShopifySettings />
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