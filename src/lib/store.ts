import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { supabase } from './supabase';

export interface UserProfile {
  full_name?: string;
  company_name?: string;
  store_url?: string;
  company_logo?: string;
  email?: string;
}

interface CreditInfo {
  credits: number;
  creditsUsed: number;
}

interface AssetCounts {
  imageCount: number;
  libraryCount: number;
}

interface GlobalState {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // User information
  userProfile: UserProfile | null;
  creditInfo: CreditInfo;
  assetCounts: AssetCounts;
  
  // Shopify connection status
  isShopifyConnected: boolean;
  
  // Gallery refresh trigger
  galleryRefreshTrigger: number;
  
  // Actions
  setIsAuthenticated: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  setCreditInfo: (info: Partial<CreditInfo>) => void;
  setAssetCounts: (counts: Partial<AssetCounts>) => void;
  setIsShopifyConnected: (value: boolean) => void;
  incrementGalleryRefreshTrigger: () => void;
  
  // Fetch functions
  fetchUserProfile: () => Promise<void>;
  fetchCreditInfo: () => Promise<void>;
  fetchAssetCounts: () => Promise<void>;
  fetchShopifyConnectionStatus: () => Promise<void>;
}

export const useGlobalStore = create<GlobalState>()(
  immer((set, get) => ({
    // Initial state
    isAuthenticated: false,
    isLoading: true,
    userProfile: null,
    creditInfo: { credits: 0, creditsUsed: 0 },
    assetCounts: { imageCount: 0, libraryCount: 0 },
    isShopifyConnected: false,
    galleryRefreshTrigger: 0,
    
    // State setters
    setIsAuthenticated: (value) => set((state) => {
      state.isAuthenticated = value;
    }),
    
    setIsLoading: (value) => set((state) => {
      state.isLoading = value;
    }),
    
    setUserProfile: (profile) => set((state) => {
      state.userProfile = profile;
    }),
    
    setCreditInfo: (info) => set((state) => {
      state.creditInfo = { ...state.creditInfo, ...info };
    }),
    
    setAssetCounts: (counts) => set((state) => {
      state.assetCounts = { ...state.assetCounts, ...counts };
    }),
    
    setIsShopifyConnected: (value) => set((state) => {
      state.isShopifyConnected = value;
    }),
    
    incrementGalleryRefreshTrigger: () => set((state) => {
      state.galleryRefreshTrigger += 1;
    }),
    
    // Fetch functions
    fetchUserProfile: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Set email as default
          let userData: UserProfile = { email: user.email };
          
          // Try to get user profile with full_name
          const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('full_name, company_name, store_url, company_logo')
            .eq('user_id', user.id)
            .single();
            
          if (!error && profile) {
            userData = { 
              ...userData, 
              full_name: profile.full_name,
              company_name: profile.company_name,
              store_url: profile.store_url,
              company_logo: profile.company_logo
            };
          }
          
          set(state => {
            state.userProfile = userData;
          });
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    },
    
    fetchCreditInfo: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Get user credits from profile
          const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('credits, credits_used')
            .eq('user_id', user.id)
            .single();
            
          if (!error && profile) {
            set(state => {
              state.creditInfo = {
                credits: profile.credits || 0,
                creditsUsed: profile.credits_used || 0
              };
            });
          }
        }
      } catch (error) {
        console.error('Error fetching credit info:', error);
      }
    },
    
    fetchAssetCounts: async () => {
      try {
        // Get count of images
        const { count: imageCount, error: imageError } = await supabase
          .from('images')
          .select('id', { count: 'exact', head: true });
          
        if (!imageError) {
          set(state => {
            state.assetCounts.imageCount = imageCount || 0;
          });
        }
        
        // Get library count from assets table
        const { count: libraryCount, error: libraryError } = await supabase
          .from('assets')
          .select('id', { count: 'exact', head: true })
          .eq('source', 'library');
          
        if (!libraryError) {
          set(state => {
            state.assetCounts.libraryCount = libraryCount || 0;
          });
        }
      } catch (error) {
        console.error('Error fetching asset counts:', error);
      }
    },
    
    fetchShopifyConnectionStatus: async () => {
      try {
        const { data: credentials, error } = await supabase
          .from('shopify_credentials')
          .select('id')
          .single();
          
        set(state => {
          state.isShopifyConnected = !error && !!credentials;
        });
      } catch (error) {
        console.error('Error fetching Shopify connection status:', error);
      }
    }
  }))
);