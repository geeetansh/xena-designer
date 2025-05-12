import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useState, createContext, useContext, useMemo } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

// Pages
import SignUpPage from '@/pages/SignUpPage';
import LoginPage from '@/pages/LoginPage';
import EmailVerificationPage from '@/pages/EmailVerificationPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import DashboardLayout from '@/layouts/DashboardLayout';
import HomePage from '@/pages/HomePage';
import GalleryPage from '@/pages/GalleryPage';
import LibraryPage from '@/pages/LibraryPage';
import PhotoshootPage from '@/pages/PhotoshootPage';
import SettingsPage from '@/pages/SettingsPage';
import ProductsPage from '@/pages/ProductsPage';
import NewAssetPage from '@/pages/NewAssetPage';
import PricingPage from '@/pages/PricingPage';
import CheckoutSuccessPage from '@/pages/CheckoutSuccessPage';

// Create auth context to avoid re-checking auth on every page
export const AuthContext = createContext<{
  session: boolean;
  loading: boolean;
}>({
  session: false,
  loading: true
});

export const useAuth = () => useContext(AuthContext);

function App() {
  const [session, setSession] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const location = useLocation();
  const { toast } = useToast();
  
  // Only check session once on initial load
  useEffect(() => {
    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error checking session:', error);
          await supabase.auth.signOut();
          setSession(false);
          return;
        }
        
        setSession(!!data.session);
        
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
              setSession(false);
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
        setSession(false);
      } finally {
        setLoading(false);
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
          setSession(false);
        } else if (
          event === 'SIGNED_IN' || 
          event === 'TOKEN_REFRESHED' || 
          event === 'USER_UPDATED' || 
          event === 'MFA_CHALLENGE_VERIFIED' ||
          event === 'INITIAL_SESSION' ||
          event === 'PASSWORD_RECOVERY'
        ) {
          setSession(!!newSession);
        }
      }
    );
    
    // Set up periodic session refresh (every 10 minutes)
    const refreshInterval = setInterval(async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        clearInterval(refreshInterval);
        await supabase.auth.signOut();
        setSession(false);
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
    session,
    loading
  }), [session, loading]);

  if (!initialCheckDone) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  // Wrap content with authenticated layout for protected routes
  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    return session ? (
      <DashboardLayout>{children}</DashboardLayout>
    ) : (
      <Navigate to="/login" replace state={{ from: location }} />
    );
  };

  // Redirect authenticated users away from auth pages
  const AuthRoute = ({ children }: { children: React.ReactNode }) => {
    return !session ? (
      <>{children}</>
    ) : (
      <Navigate to="/home" replace />
    );
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      <ThemeProvider defaultTheme="light">
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
        
        <Toaster />
      </ThemeProvider>
    </AuthContext.Provider>
  );
}

export default App;