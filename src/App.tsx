import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useState, createContext, useContext, useMemo } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { identifyUser, resetUser, trackEvent } from '@/lib/posthog';

// Pages
import SignUpPage from '@/pages/SignUpPage';
import LoginPage from '@/pages/LoginPage';
import EmailVerificationPage from '@/pages/EmailVerificationPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import DashboardLayout from '@/layouts/DashboardLayout';
import HomePage from '@/pages/HomePage';
import LibraryPage from '@/pages/LibraryPage';
import AutomatePage from '@/pages/AutomatePage';
import AutomationBuilderPage from '@/pages/AutomationBuilderPage';
import SettingsPage from '@/pages/SettingsPage';
import ProductsPage from '@/pages/ProductsPage';
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
          
          // If we have a user, identify them in PostHog
          if (data.session.user) {
            // Get user's auth provider
            const provider = data.session.user.app_metadata?.provider || 'email';
            
            identifyUser(data.session.user.id, {
              email: data.session.user.email,
              provider: provider
            });
            
            // Track login event
            trackEvent('session_restored', { provider: provider });
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
          // Reset PostHog user on sign out
          resetUser();
          trackEvent('user_signed_out');
        } else if (
          event === 'SIGNED_IN' || 
          event === 'TOKEN_REFRESHED' || 
          event === 'USER_UPDATED' || 
          event === 'MFA_CHALLENGE_VERIFIED' ||
          event === 'INITIAL_SESSION' ||
          event === 'PASSWORD_RECOVERY'
        ) {
          setSession(!!newSession);
          
          // Identify user in PostHog
          if (newSession?.user) {
            // Get user's auth provider
            const provider = newSession.user.app_metadata?.provider || 'email';
            
            identifyUser(newSession.user.id, {
              email: newSession.user.email,
              provider: provider
            });
            
            // Track sign-in event
            if (event === 'SIGNED_IN') {
              trackEvent('user_signed_in', { provider: provider });
            }
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

  // Track page views
  useEffect(() => {
    // Track page view with PostHog
    trackEvent('$pageview', {
      path: location.pathname,
      url: window.location.href,
      referrer: document.referrer,
    });
  }, [location.pathname]);

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
          
          {/* Handle OAuth callbacks */}
          <Route 
            path="/auth/callback" 
            element={session ? <Navigate to="/home" replace /> : <Navigate to="/login" replace />} 
          />

          {/* Public routes */}
          <Route path="/verify" element={<EmailVerificationPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
          <Route path="/checkout/cancel" element={<Navigate to="/pricing" replace />} />
          
          {/* Auth routes - redirect to /home if already signed in */}
          <Route path="/sign-up" element={<AuthRoute><SignUpPage /></AuthRoute>} />
          <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
          
          {/* Full-page editors */}
          <Route path="/automation-builder" element={
            session ? <AutomationBuilderPage /> : <Navigate to="/login" replace state={{ from: location }} />
          } />
          
          {/* Protected routes - all nested under DashboardLayout */}
          <Route element={
            session ? <DashboardLayout /> : <Navigate to="/login" replace state={{ from: location }} />
          }>
            <Route path="/home" element={<HomePage />} />
            {/* Hidden routes - kept for future use */}
            {/* <Route path="/photoshoot" element={<PhotoshootPage />} /> */}
            <Route path="/automate" element={<AutomatePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            
            {/* Redirect /generate to /automate */}
            <Route path="/generate" element={<Navigate to="/automate" replace />} />
          </Route>
          
          {/* Legacy dashboard routes - redirect to new URLs */}
          <Route path="/dashboard" element={<Navigate to="/home" replace />} />
          <Route path="/dashboard/library" element={<Navigate to="/library" replace />} />
          <Route path="/dashboard/settings" element={<Navigate to="/settings" replace />} />
          <Route path="/dashboard/products" element={<Navigate to="/products" replace />} />
          <Route path="/dashboard/automate" element={<Navigate to="/automate" replace />} />
          
          {/* Catch-all redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        
        <Toaster />
      </ThemeProvider>
    </AuthContext.Provider>
  );
}

export default App;