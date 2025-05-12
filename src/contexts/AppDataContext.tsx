import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserCredits } from '@/services/imageService';
import { getShopifyCredentials } from '@/services/shopifyService';

interface UserProfile {
  full_name?: string | null;
  email?: string | null;
  company_logo?: string | null;
}

interface AppDataContextType {
  userProfile: UserProfile | null;
  imageCount: number;
  libraryCount: number;
  credits: number;
  creditsUsed: number;
  isShopifyConnected: boolean;
  isLoading: boolean;
  refreshData: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [imageCount, setImageCount] = useState(0);
  const [libraryCount, setLibraryCount] = useState(0);
  const [credits, setCredits] = useState(0);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [isShopifyConnected, setIsShopifyConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Function to fetch all data
  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Set email as default
        let userData = { email: user.email };
        
        // Try to get user profile with full_name and company_logo
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('full_name, company_logo')
          .eq('user_id', user.id)
          .single();
          
        if (!error && profile) {
          userData.full_name = profile.full_name;
          userData.company_logo = profile.company_logo;
        }
        
        setUserProfile(userData);
        
        // Get count of images
        const { count: imageCountData } = await supabase
          .from('images')
          .select('id', { count: 'exact', head: true });
          
        setImageCount(imageCountData || 0);
        
        // Get user credits
        const { credits: creditsData, creditsUsed: creditsUsedData } = await getUserCredits();
        setCredits(creditsData);
        setCreditsUsed(creditsUsedData);
        
        // Get library count from assets table
        const { count: libraryCountData } = await supabase
          .from('assets')
          .select('id', { count: 'exact', head: true })
          .eq('source', 'library');
          
        setLibraryCount(libraryCountData || 0);
        
        // Check if Shopify is connected
        const credentials = await getShopifyCredentials();
        setIsShopifyConnected(!!credentials);
      }
    } catch (error) {
      console.error('Error fetching app data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchData();
    
    // Set up subscriptions for real-time updates
    const userProfilesChannel = supabase
      .channel('user-profiles-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `user_id=eq.${supabase.auth.getSession().then(({ data }) => data.session?.user.id)}`
        },
        (payload) => {
          // Update credits when they change
          if ('credits' in payload.new || 'credits_used' in payload.new) {
            setCredits(payload.new.credits || 0);
            setCreditsUsed(payload.new.credits_used || 0);
          }
          
          // Update user profile when it changes
          if ('full_name' in payload.new || 'company_logo' in payload.new) {
            setUserProfile(prev => ({
              ...prev,
              full_name: payload.new.full_name,
              company_logo: payload.new.company_logo
            }));
          }
        }
      )
      .subscribe();
      
    // Set up subscription for image count changes
    const imagesChannel = supabase
      .channel('images-count-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'images'
        },
        async () => {
          // Just update the count on any change to images table
          const { count } = await supabase
            .from('images')
            .select('id', { count: 'exact', head: true });
            
          setImageCount(count || 0);
        }
      )
      .subscribe();
    
    // Set up subscription for library count changes
    const assetsChannel = supabase
      .channel('assets-count-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'assets',
          filter: "source=eq.library"
        },
        async () => {
          // Just update the count on any change to assets table (library source)
          const { count } = await supabase
            .from('assets')
            .select('id', { count: 'exact', head: true })
            .eq('source', 'library');
            
          setLibraryCount(count || 0);
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(userProfilesChannel);
      supabase.removeChannel(imagesChannel);
      supabase.removeChannel(assetsChannel);
    };
  }, []);

  // Create memoized context value
  const contextValue = useMemo(() => ({
    userProfile,
    imageCount,
    libraryCount,
    credits,
    creditsUsed,
    isShopifyConnected,
    isLoading,
    refreshData: fetchData
  }), [
    userProfile,
    imageCount,
    libraryCount,
    credits,
    creditsUsed,
    isShopifyConnected,
    isLoading
  ]);

  return (
    <AppDataContext.Provider value={contextValue}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  
  return context;
}