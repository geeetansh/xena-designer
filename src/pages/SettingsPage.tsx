import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ShopifySettings } from '@/components/ShopifySettings';
import { UserProfileForm } from '@/components/UserProfileForm';
import { InstructionsSettings } from '@/components/InstructionsSettings';
import { SubscriptionSettings } from '@/components/SubscriptionSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CheckCircle, Settings2, Image, Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getImageQuality, saveImageQuality } from '@/services/settingsService';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [imageQuality, setImageQuality] = useState<string>('low');
  const [isLoadingQuality, setIsLoadingQuality] = useState(false);
  const [isSavingQuality, setIsSavingQuality] = useState(false);
  const location = useLocation();
  const { toast } = useToast();
  
  // Check if there's a tab parameter in the URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get('tab');
    if (tab && ['general', 'shopify', 'instructions', 'subscription'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [location]);
  
  // Load image quality setting
  useEffect(() => {
    async function loadImageQuality() {
      try {
        setIsLoadingQuality(true);
        const quality = await getImageQuality();
        setImageQuality(quality);
      } catch (error) {
        console.error('Error loading image quality setting:', error);
      } finally {
        setIsLoadingQuality(false);
      }
    }
    
    loadImageQuality();
  }, []);
  
  // Handle image quality change
  const handleQualityChange = async (value: string) => {
    try {
      setIsSavingQuality(true);
      setImageQuality(value);
      
      const success = await saveImageQuality(value);
      
      if (success) {
        toast({
          title: 'Image quality updated',
          description: `Image generation quality set to ${value}`,
        });
      } else {
        throw new Error('Failed to save image quality setting');
      }
    } catch (error) {
      console.error('Error saving image quality:', error);
      toast({
        title: 'Error',
        description: 'Failed to save image quality setting',
        variant: 'destructive',
      });
      
      // Revert to previous value
      const quality = await getImageQuality();
      setImageQuality(quality);
    } finally {
      setIsSavingQuality(false);
    }
  };

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
            {/* Image Quality Settings Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5 text-primary" />
                  Image Quality Settings
                </CardTitle>
                <CardDescription>
                  Control the quality of generated images. Higher quality will produce better results but may take longer.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div className="space-y-2">
                      <Label htmlFor="image-quality">Image Generation Quality</Label>
                      <Select 
                        value={imageQuality} 
                        onValueChange={handleQualityChange}
                        disabled={isLoadingQuality || isSavingQuality}
                      >
                        <SelectTrigger id="image-quality">
                          <SelectValue placeholder="Select quality" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low (Fastest)</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High (Best Quality)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isLoadingQuality ? (
                          <span className="flex items-center">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Loading setting...
                          </span>
                        ) : isSavingQuality ? (
                          <span className="flex items-center">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Saving setting...
                          </span>
                        ) : (
                          <span className="flex items-center">
                            <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                            Current setting: {imageQuality}
                          </span>
                        )}
                      </p>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      <ul className="space-y-1 list-disc pl-4">
                        <li><strong>Low:</strong> Faster generation, basic details</li>
                        <li><strong>Medium:</strong> Balanced quality and speed</li>
                        <li><strong>High:</strong> Best quality, more details, slower generation</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* User Profile Form */}
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