import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getUserCredits } from '@/services/imageService';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

import { 
  LogOut, 
  Menu, 
  Sparkles,
  ChevronRight,
  X,
  GalleryVerticalEnd 
} from 'lucide-react';
import { TbSmartHome, TbPhotoSquareRounded } from 'react-icons/tb';
import { FaRegBell, FaBullhorn } from "react-icons/fa6";
import { SiShopify } from "react-icons/si";
import { IoSettingsOutline } from "react-icons/io5";
import { LuLibrary } from "react-icons/lu";

export default function DashboardLayout() {
  const [libraryCount, setLibraryCount] = useState(0);
  const [staticAdCount, setStaticAdCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{ full_name?: string; email?: string; company_logo?: string } | null>(null);
  const [credits, setCredits] = useState(0);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  // Load user data just once on initial mount
  useEffect(() => {
    let isMounted = true;
    
    async function fetchUserData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user && isMounted) {
          // Get user profile
          const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('full_name, company_logo')
            .eq('user_id', user.id)
            .single();
          
          if (!error && profile && isMounted) {
            setUserProfile({ 
              full_name: profile.full_name,
              email: user.email,
              company_logo: profile.company_logo
            });
          } else if (isMounted) {
            setUserProfile({ email: user.email });
          }
          
          // Get user credits
          const { credits, creditsUsed } = await getUserCredits();
          if (isMounted) {
            setCredits(credits);
            setCreditsUsed(creditsUsed);
          }
        }
        
        // Only load counts after a delay
        setTimeout(() => {
          if (isMounted) {
            // Get library count from assets table (replacing library_images)
            supabase
              .from('assets')
              .select('id', { count: 'exact', head: true })
              .eq('source', 'library')
              .then(({ count }) => {
                if (isMounted) setLibraryCount(count || 0);
              });
              
            // Get static ad count
            supabase
              .from('generation_jobs')
              .select('id', { count: 'exact', head: true })
              .then(({ count }) => {
                if (isMounted) setStaticAdCount(count || 0);
              });
          }
        }, 1000);
        
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        if (isMounted) {
          setIsInitialLoad(false);
        }
      }
    }
    
    fetchUserData();
    
    // Set up a subscription for credit changes
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
          // Update credits when they change
          if (isMounted) {
            setCredits(payload.new.credits || 0);
            setCreditsUsed(payload.new.credits_used || 0);
          }
        }
      )
      .subscribe();
      
    // Cleanup subscription and prevent state updates after unmount
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Listen for navigation events
  useEffect(() => {
    const navigateToGenerate = () => {
      navigate('/photoshoot');
    };
    
    const navigateToShopifySettings = () => {
      navigate('/settings');
      // Wait for component to render and then switch to Shopify tab
      setTimeout(() => {
        const shopifyTab = document.querySelector('[data-value="shopify"]');
        if (shopifyTab && shopifyTab instanceof HTMLElement) {
          shopifyTab.click();
        }
      }, 100);
    };
    
    window.addEventListener('navigateToGenerate', navigateToGenerate);
    window.addEventListener('navigateToShopifySettings', navigateToShopifySettings);
    
    return () => {
      window.removeEventListener('navigateToGenerate', navigateToGenerate);
      window.removeEventListener('navigateToShopifySettings', navigateToShopifySettings);
    };
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out successfully');
    navigate('/login');
  };

  // Get user display name for the sidebar
  const getUserDisplayName = () => {
    if (userProfile?.full_name) {
      return userProfile.full_name;
    } else if (userProfile?.email) {
      return userProfile.email.split('@')[0];
    }
    return 'User';
  };

  // Navigation categories for the sidebar
  const navigationItems = {
    main: [
      { id: 'home', label: 'Home', icon: <TbSmartHome className="h-5 w-5" /> }
    ],
    generate: [
      { 
        id: 'automate', 
        label: 'Static ad', 
        icon: <GalleryVerticalEnd className="h-5 w-5" />,
        badge: staticAdCount > 0 ? staticAdCount : undefined
      }
    ],
    others: [
      { id: 'library', label: 'Assets', icon: <LuLibrary className="h-5 w-5" />, badge: libraryCount > 0 ? libraryCount : undefined },
      { id: 'products', label: 'My Products', icon: <SiShopify className="h-5 w-5" /> },
      { id: 'settings', label: 'Settings', icon: <IoSettingsOutline className="h-5 w-5" /> }
    ]
  };

  // Get the current page title
  const getPageTitle = () => {
    const path = location.pathname.split('/').pop();
    
    switch (path) {
      case 'home':
        return 'Home';
      case 'library':
        return 'Assets';
      case 'automate':
        return 'Static ad';
      case 'products':
        return 'My Products';
      case 'settings':
        return 'Settings';
      default:
        return 'Dashboard';
    }
  };

  // Sidebar component
  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`flex flex-col h-full ${mobile ? '' : 'w-64 border-r'}`}>
      {/* Logo */}
      <div className="py-6 px-4 mb-2">
        <img 
          src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6810f7c3918810c7e1a3fb13_Xena.png"
          alt="Xena Logo"
          className="h-10 object-contain mx-auto"
        />
      </div>
      
      {/* Main Navigation */}
      <div className="flex-1 py-2 overflow-y-auto">
        <nav className="space-y-1 px-3">
          {navigationItems.main.map(item => (
            <NavLink
              key={item.id}
              to={`/${item.id}`}
              className={({ isActive }) => 
                `flex items-center w-full justify-start gap-2 px-3 py-2 rounded-md mb-1 ${
                  isActive 
                    ? 'bg-secondary font-medium' 
                    : 'text-foreground/70 hover:bg-secondary/80 hover:text-foreground'
                }`
              }
              onClick={() => mobile && setIsMobileMenuOpen(false)}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <Badge variant="secondary" className="ml-auto">
                  {item.badge}
                </Badge>
              )}
            </NavLink>
          ))}
        </nav>
        
        {/* Generate section */}
        <div className="mt-6 px-3">
          <div className="text-xs font-medium text-muted-foreground px-3 mb-2">
            Generate
          </div>
          <nav className="space-y-1">
            {navigationItems.generate.map(item => (
              <NavLink
                key={item.id}
                to={`/${item.id}`}
                className={({ isActive }) => 
                  `flex items-center w-full justify-start gap-2 px-3 py-2 rounded-md mb-1 ${
                    isActive 
                      ? 'bg-secondary font-medium' 
                      : 'text-foreground/70 hover:bg-secondary/80 hover:text-foreground'
                  }`
                }
                onClick={() => mobile && setIsMobileMenuOpen(false)}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <Badge variant="secondary" className="ml-auto">
                    {item.badge}
                  </Badge>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        
        {/* Others section */}
        <div className="mt-6 px-3">
          <div className="text-xs font-medium text-muted-foreground px-3 mb-2">
            Others
          </div>
          <nav className="space-y-1">
            {navigationItems.others.map(item => (
              <NavLink
                key={item.id}
                to={`/${item.id}`}
                className={({ isActive }) => 
                  `flex items-center w-full justify-start gap-2 px-3 py-2 rounded-md mb-1 ${
                    isActive 
                      ? 'bg-secondary font-medium' 
                      : 'text-foreground/70 hover:bg-secondary/80 hover:text-foreground'
                  }`
                }
                onClick={() => mobile && setIsMobileMenuOpen(false)}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <Badge variant="secondary" className="ml-auto">
                    {item.badge}
                  </Badge>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      
      {/* User controls and credits at bottom */}
      <div className="mt-auto">
        {/* Credits counter */}
        <div className="p-4 border-t border-b">
          <div className="flex items-center justify-center">
            <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
              Credits: {credits}
            </Badge>
          </div>
        </div>
        
        {/* User profile section */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium overflow-hidden">
                {userProfile?.company_logo ? (
                  <img 
                    src={userProfile.company_logo} 
                    alt="Company logo" 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  getUserDisplayName().charAt(0).toUpperCase()
                )}
              </div>
              <div className="ml-2">
                <p className="text-sm font-medium">{getUserDisplayName()}</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSignOut}
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  // Combine navigation items for mobile bottom bar
  const mobileNavItems = [
    navigationItems.main[0], // Home
    navigationItems.generate[0], // Static ad
    navigationItems.others[0], // Assets
  ];

  return (
    <div className="min-h-screen bg-background w-full flex">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden md:block h-screen sticky top-0">
        <Sidebar />
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="md:hidden w-full px-4 py-3 border-b flex items-center justify-between bg-background sticky top-0 z-10">
          <div className="flex items-center">
            <img 
              src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6810f7c3918810c7e1a3fb13_Xena.png"
              alt="Xena Logo"
              className="h-9 object-contain"
            />
          </div>
          
          {/* User profile button for mobile */}
          <Button 
            variant="ghost" 
            size="icon"
            className="flex items-center justify-center"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium overflow-hidden">
              {userProfile?.company_logo ? (
                <img 
                  src={userProfile.company_logo} 
                  alt="Profile" 
                  className="w-full h-full object-cover" 
                />
              ) : (
                getUserDisplayName().charAt(0).toUpperCase()
              )}
            </div>
          </Button>
          
          {/* Mobile Menu Sheet */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetContent side="right" className="p-0">
              <Sidebar mobile={true} />
            </SheetContent>
          </Sheet>
        </header>
        
        {/* Page Title - Desktop */}
        <header className="hidden md:flex w-full px-6 py-4 border-b">
          <h2 className="text-2xl font-semibold">
            {getPageTitle()}
          </h2>
        </header>
        
        {/* Main Content Area - Add bottom padding on mobile to account for navbar */}
        <main className="flex-1 w-full p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
        
        {/* Desktop Footer */}
        <footer className="hidden md:block w-full py-4 px-4 border-t mt-auto">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Xena AI
          </p>
        </footer>
        
        {/* Mobile Bottom Navigation Bar */}
        <footer className="md:hidden fixed bottom-0 left-0 right-0 z-10 bg-background border-t px-2 py-1">
          <div className="flex justify-around items-center">
            {mobileNavItems.map((item) => (
              <NavLink
                key={item.id}
                to={`/${item.id}`}
                className={({ isActive }) => `
                  flex flex-col items-center justify-center py-2 px-1 relative
                  ${isActive ? 'text-primary' : 'text-muted-foreground'}
                `}
              >
                <div className="h-6 w-6 flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="text-[10px] mt-0.5">{item.label}</span>
                {item.badge && (
                  <Badge variant="secondary" className="absolute -top-1 right-0 h-4 w-4 p-0 flex items-center justify-center text-[8px]">
                    {item.badge > 99 ? '99+' : item.badge}
                  </Badge>
                )}
              </NavLink>
            ))}
            
            {/* Settings as the last item */}
            <NavLink
              to="/settings"
              className={({ isActive }) => `
                flex flex-col items-center justify-center py-2 px-1
                ${isActive ? 'text-primary' : 'text-muted-foreground'}
              `}
            >
              <div className="h-6 w-6 flex items-center justify-center">
                <IoSettingsOutline className="h-5 w-5" />
              </div>
              <span className="text-[10px] mt-0.5">Settings</span>
            </NavLink>
          </div>
        </footer>
      </div>
    </div>
  );
}