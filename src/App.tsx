import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useState, createContext, useContext, useMemo, lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useGlobalStore } from '@/lib/store';

// Lazy load pages for better performance
const SignUpPage = lazy(() => import('@/pages/SignUpPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const EmailVerificationPage = lazy(() => import('@/pages/EmailVerificationPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const DashboardLayout = lazy(() => import('@/layouts/DashboardLayout'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const GalleryPage = lazy(() => import('@/pages/GalleryPage'));
const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const PhotoshootPage = lazy(() => import('@/pages/PhotoshootPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ProductsPage = lazy(() => import('@/pages/ProductsPage'));
const NewAssetPage = lazy(() => import('@/pages/NewAssetPage'));
const PricingPage = lazy(() => import('@/pages/PricingPage'));
const CheckoutSuccessPage = lazy(() => import('@/pages/CheckoutSuccessPage'));

// Create auth context to avoid re-checking auth on every page
export const AuthContext = createContext<{
  session: boolean;
  loading: boolean;
}>({
  session: false,
  loading: true
});

export const useAuth = () => useContext(AuthContext);

// Loading component for Suspense fallback
const LoadingFallback = () => (
  <div className="flex justify-center items-center min-h-screen">
    <div className="animate-pulse">Loading...</div>
  </div>
);

function App() {
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const location = useLocation();
  const { toast } = useToast();
  
  // Global state from Zustand
  const { 
    isAuthenticated, 
    isLoading, 
    setIsAuthenticated, 
    setIsLoading,
    fetchUserProfile,
    fetchCreditInfo,
    fetchAssetCounts,
    fetchShopifyConnectionStatus 
  } = useGlobalStore();
  
  // Only check session once on initial load
  useEffect(() => {
    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error checking session:', error);
          await supabase.auth.signOut();
          setIsAuthenticated(false);
          return;
        }
        
        setIsAuthenticated(!!data.session);
        
        // If session exists but is close to expiring, refresh it
        if (data.session) {
          const expiresAt = data.session.expires_at;
          const currentTime = Math.floor(Date.now() / 1000);
          // Refresh if session expires in less than 60 minutes (3600 seconds)
          if (expiresAt && expiresAt - currentTime < 3600) {
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              console.error('Error refreshing session:', refreshError);
              await supabase.auth.signOut();
              setIsAuthenticated(false);
              toast({
                title: "Session expired",
                description: "Please sign in again to continue.",
                variant: "destructive"
              });
            }
          }
        }
      } catch (error) {
        console.error('Error checking session:', error);
        await supabase.auth.signOut();
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
        setInitialCheckDone(true);
      }
    }
    
    checkSession();
  }, []);
  
  // Set up auth state listener - but only act on changes, not initial state
  useEffect(() => {
    if (!initialCheckDone) return;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (event === 'SIGNED_OUT') {
          setIsAuthenticated(false);
        } else if (
          event === 'SIGNED_IN' || 
          event === 'TOKEN_REFRESHED' || 
          event === 'USER_UPDATED' || 
          event === 'MFA_CHALLENGE_VERIFIED' ||
          event === 'INITIAL_SESSION' ||
          event === 'PASSWORD_RECOVERY'
        ) {
          setIsAuthenticated(!!newSession);
          
          // Fetch user data when signed in
          if (newSession) {
            // Fetch all user data in parallel
            await Promise.all([
              fetchUserProfile(),
              fetchCreditInfo(),
              fetchAssetCounts(),
              fetchShopifyConnectionStatus()
            ]);
          }
        }
      }
    );
    
    // Set up periodic session refresh (every 10 minutes)
    const refreshInterval = setInterval(async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        clearInterval(refreshInterval);
        await supabase.auth.signOut();
        setIsAuthenticated(false);
        if (isProtectedRoute(location.pathname)) {
          toast({
            title: "Session expired",
            description: "Please sign in again to continue.",
            variant: "destructive"
          });
        }
      }
    }, 10 * 60 * 1000); // 10 minutes
    
    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, [initialCheckDone, location.pathname]);

  // Refresh counts and credit info when the user completes actions that would change them
  useEffect(() => {
    if (isAuthenticated) {
      // Setup listeners for gallery updates and credit changes
      const galleryUpdateHandler = () => {
        fetchAssetCounts();
      };
      
      const creditUpdateHandler = () => {
        fetchCreditInfo();
      };
      
      window.addEventListener('galleryUpdated', galleryUpdateHandler);
      window.addEventListener('creditsChanged', creditUpdateHandler);
      
      // Connect to the Supabase realtime channel for credit updates
      const channel = supabase
        .channel('credit-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_profiles',
            filter: `user_id=eq.${supabase.auth.getSession().then(({ data }) => data.session?.user.id)}`
          },
          async (payload) => {
            fetchCreditInfo();
          }
        )
        .subscribe();
      
      return () => {
        window.removeEventListener('galleryUpdated', galleryUpdateHandler);
        window.removeEventListener('creditsChanged', creditUpdateHandler);
        supabase.removeChannel(channel);
      };
    }
  }, [isAuthenticated]);

  // Check if the route is a protected route
  const isProtectedRoute = (path: string) => {
    const publicRoutes = ['/login', '/sign-up', '/verify', '/reset-password', '/pricing', '/checkout/success', '/checkout/cancel'];
    return !publicRoutes.includes(path);
  };
  
  // Check if the route is an auth page (login/signup)
  const isAuthPage = (path: string) => {
    return path === '/login' || path === '/sign-up';
  };
  
  // Provide auth context to avoid re-checking auth on every page navigation
  const authContextValue = useMemo(() => ({
    session: isAuthenticated,
    loading: isLoading
  }), [isAuthenticated, isLoading]);

  if (!initialCheckDone) {
    return <LoadingFallback />;
  }

  // Wrap content with authenticated layout for protected routes
  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    return isAuthenticated ? (
      <DashboardLayout>{children}</DashboardLayout>
    ) : (
      <Navigate to="/login" replace state={{ from: location }} />
    );
  };

  // Redirect authenticated users away from auth pages
  const AuthRoute = ({ children }: { children: React.ReactNode }) => {
    return !isAuthenticated ? (
      <>{children}</>
    ) : (
      <Navigate to="/home" replace />
    );
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      <ThemeProvider defaultTheme="light">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Redirect root path to login */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            
            {/* Public routes */}
            <Route path="/verify" element={<EmailVerificationPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
            <Route path="/checkout/cancel" element={<Navigate to="/pricing" replace />} />
            
            {/* Auth routes - redirect to /home if already signed in */}
            <Route path="/sign-up" element={<AuthRoute><SignUpPage /></AuthRoute>} />
            <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
            
            {/* New Asset Page (full-page editor) */}
            <Route path="/new-asset" element={<ProtectedRoute><NewAssetPage /></ProtectedRoute>} />
            
            {/* Protected routes with DashboardLayout */}
            <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/gallery" element={<ProtectedRoute><GalleryPage /></ProtectedRoute>} />
            <Route path="/library" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
            <Route path="/photoshoot" element={<ProtectedRoute><PhotoshootPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
            
            {/* Redirect /generate to /photoshoot */}
            <Route path="/generate" element={<Navigate to="/photoshoot" replace />} />
            
            {/* Legacy dashboard routes - redirect to new URLs */}
            <Route path="/dashboard" element={<Navigate to="/home" replace />} />
            <Route path="/dashboard/gallery" element={<Navigate to="/gallery" replace />} />
            <Route path="/dashboard/library" element={<Navigate to="/library" replace />} />
            <Route path="/dashboard/generate" element={<Navigate to="/photoshoot" replace />} />
            <Route path="/dashboard/settings" element={<Navigate to="/settings" replace />} />
            <Route path="/dashboard/products" element={<Navigate to="/products" replace />} />
            <Route path="/dashboard/photoshoot" element={<Navigate to="/photoshoot" replace />} />
            
            {/* Catch-all redirect to login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
        
        <Toaster />
      </ThemeProvider>
    </AuthContext.Provider>
  );
}

export default App;