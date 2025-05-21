import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { getUserCredits } from '@/services/imageService';
import { getShopifyCredentials } from '@/services/shopifyService';
import { fetchAssets } from '@/services/AssetsService';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { 
  FaShopify as ShopifyIcon
} from "react-icons/fa6";
import { GalleryVerticalEnd as LuGalleryVerticalEnd } from "lucide-react";
import { TbPhotoSquareRounded, TbCoins } from "react-icons/tb";
import { FaBullhorn } from "react-icons/fa6";

export default function HomePage() {
  const [userProfile, setUserProfile] = useState<{
    full_name?: string | null;
    email?: string | null;
  } | null>(null);
  const [libraryCount, setLibraryCount] = useState(0);
  const [credits, setCredits] = useState(0);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isShopifyConnected, setIsShopifyConnected] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchUserData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Set email as default
          let userData = { email: user.email };
          
          // Try to get user profile with full_name
          const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('full_name')
            .eq('user_id', user.id)
            .single();
            
          if (!error && profile && profile.full_name) {
            userData.full_name = profile.full_name;
          }
          
          setUserProfile(userData);
          
          // Get user credits
          const { credits, creditsUsed } = await getUserCredits();
          setCredits(credits);
          setCreditsUsed(creditsUsed);
          
          // Get library count from assets table (replacing library_images)
          const { data: libraryAssets, error: libraryError } = await supabase
            .from('assets')
            .select('id', { count: 'exact', head: true })
            .eq('source', 'library');
            
          if (!libraryError) {
            setLibraryCount(libraryAssets?.length || 0);
          }
          
          // Check if Shopify is connected
          const credentials = await getShopifyCredentials();
          setIsShopifyConnected(!!credentials);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchUserData();
  }, []);

  // Get appropriate user name for greeting
  const getUserName = () => {
    if (userProfile?.full_name) {
      return userProfile.full_name;
    } else if (userProfile?.email) {
      return userProfile.email.split('@')[0];
    }
    return 'there';
  };

  return (
    <div className="max-w-4xl mx-auto w-full py-4 md:py-8">
      <div className="space-y-4 md:space-y-8">
        {/* Welcome header */}
        <div className="space-y-1 md:space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">
            {isLoading ? (
              <div className="h-8 w-40 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              `Welcome ${getUserName()}!`
            )}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            What would you like to do today?
          </p>
        </div>
        
        {/* Subscription banner */}
        <SubscriptionBanner />
        
        {/* Quick shortcuts */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
          {/* Generate Now */}
          <div className="bg-card rounded-lg border shadow-sm p-3 md:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-muted-foreground">Generate Now</p>
                <h3 className="text-lg md:text-2xl font-bold mt-1">Create Static Ads</h3>
              </div>
              <div className="bg-primary/10 p-1.5 md:p-2 rounded-full">
                <FaBullhorn className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-1 md:mt-2 mb-2 md:mb-4 line-clamp-2">
              Create automated ads for your products with AI
            </p>
            <div className="mt-auto">
              <Button 
                variant="default" 
                className="w-full text-xs md:text-sm h-8 md:h-10" 
                onClick={() => navigate('/automation-builder')}
              >
                Start creating
              </Button>
            </div>
          </div>
          
          {/* Images created */}
          <div className="bg-card rounded-lg border shadow-sm p-3 md:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-muted-foreground">Library</p>
                <h3 className="text-lg md:text-2xl font-bold mt-1">{libraryCount}</h3>
              </div>
              <div className="bg-primary/10 p-1.5 md:p-2 rounded-full">
                <LuGalleryVerticalEnd className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-1 md:mt-2 mb-2 md:mb-4 line-clamp-2">
              View and manage your uploaded reference images
            </p>
            <div className="mt-auto">
              <Link to="/library">
                <Button 
                  variant="outline" 
                  className="w-full text-xs md:text-sm h-8 md:h-10"
                >
                  View all
                </Button>
              </Link>
            </div>
          </div>
          
          {/* Connected store */}
          <div className="bg-card rounded-lg border shadow-sm p-3 md:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-muted-foreground">Shopify Store</p>
                <h3 className="text-lg md:text-2xl font-bold mt-1">
                  {isShopifyConnected ? "Connected" : "Not connected"}
                </h3>
              </div>
              <div className="bg-primary/10 p-1.5 md:p-2 rounded-full">
                <ShopifyIcon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-1 md:mt-2 mb-2 md:mb-4 line-clamp-2">
              {isShopifyConnected 
                ? "Your Shopify store is connected" 
                : "Connect your Shopify store to import products"}
            </p>
            <div className="mt-auto">
              {isShopifyConnected ? (
                <Link to="/products">
                  <Button 
                    variant="outline" 
                    className="w-full text-xs md:text-sm h-8 md:h-10"
                  >
                    View products
                  </Button>
                </Link>
              ) : (
                <Link to="/settings">
                  <Button 
                    variant="outline" 
                    className="w-full text-xs md:text-sm h-8 md:h-10"
                  >
                    Connect store
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Credits section */}
        <div className="bg-card rounded-lg border shadow-sm p-4 md:p-6">
          <div className="flex items-start justify-between mb-2 md:mb-4">
            <div>
              <h3 className="text-lg md:text-xl font-bold">Your Credits</h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
                Use credits to generate new creative assets
              </p>
            </div>
            <div className="bg-primary/10 p-1.5 md:p-2 rounded-full">
              <TbCoins className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 md:gap-6 items-center">
            <div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">Available</p>
              <h3 className="text-xl md:text-3xl font-bold">{credits}</h3>
            </div>
            <div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">Used</p>
              <h3 className="text-xl md:text-3xl font-bold">{creditsUsed}</h3>
            </div>
            
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 md:h-10 text-xs md:text-sm"
                onClick={() => navigate('/pricing')}
              >
                <TbCoins className="h-4 w-4 mr-1.5" />
                Get More Credits
              </Button>
              
              <Button
                size="sm"
                className="h-8 md:h-10 text-xs md:text-sm"
                onClick={() => navigate('/automation-builder')}
              >
                Start Creating
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}