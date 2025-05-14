import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Loader2, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/App';
import { products, getOneTimeProducts } from '@/stripe-config';
import { createCheckoutSession, getUserSubscription } from '@/services/stripeService';

export default function PricingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [currentCredits, setCurrentCredits] = useState<number | null>(null);
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const oneTimeProducts = getOneTimeProducts();

  useEffect(() => {
    // Fetch user's current credits if they're logged in
    if (session) {
      const fetchCredits = async () => {
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('credits')
            .single();
          
          if (!error && data) {
            setCurrentCredits(data.credits);
          }
        } catch (err) {
          console.error('Error fetching user credits:', err);
        }
      };
      
      fetchCredits();
    }
  }, [session]);
  
  const handlePurchase = async (priceId: string) => {
    if (!session) {
      toast({
        title: "Login required",
        description: "Please sign in to purchase credits",
        variant: "destructive"
      });
      navigate('/login', { state: { from: '/pricing' } });
      return;
    }
    
    try {
      setIsLoading(true);
      setLoadingProductId(priceId);
      
      const { url } = await createCheckoutSession(
        priceId,
        `${window.location.origin}/checkout/success`,
        `${window.location.origin}/pricing`
      );
      
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: "Checkout failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setLoadingProductId(null);
    }
  };
  
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="py-4 px-4 md:px-6 border-b">
        <div className="container mx-auto flex items-center justify-between">
          <Link to="/">
            <img 
              src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6810f7c3918810c7e1a3fb13_Xena.png" 
              alt="Xena Logo" 
              className="h-8 w-auto" 
            />
          </Link>
          
          {session ? (
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          ) : (
            <Button onClick={() => navigate('/login')}>Sign In</Button>
          )}
        </div>
      </header>

      <main className="flex-1 py-8 md:py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-4">Purchase Credits</h1>
            <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Choose the credit package that works best for your needs
            </p>
            
            {session && currentCredits !== null && (
              <div className="mt-4 inline-flex items-center bg-primary/10 px-4 py-2 rounded-full">
                <CreditCard className="h-4 w-4 mr-2 text-primary" />
                <span>Current balance: <strong>{currentCredits} credits</strong></span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {oneTimeProducts.map((product) => {
              // Calculate price per credit
              const pricePerCredit = parseFloat(product.price.replace('$', '')) / product.credits;
              const formattedPricePerCredit = `$${pricePerCredit.toFixed(2)}`;
              
              // Determine if this is the best value
              const isBestValue = product.name === "1000 credits topup";
              
              return (
                <Card 
                  key={product.priceId} 
                  className={`flex flex-col h-full ${isBestValue ? 'border-2 border-primary/50 shadow-lg' : ''}`}
                >
                  <CardHeader className="pb-4">
                    {isBestValue && (
                      <div className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full w-fit mb-2">
                        BEST VALUE
                      </div>
                    )}
                    <CardTitle className="text-xl md:text-2xl">{product.name}</CardTitle>
                    <CardDescription>{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 flex-1">
                    <div className="mb-6">
                      <span className="text-2xl md:text-3xl font-bold">{product.price}</span>
                      <span className="text-muted-foreground ml-2">one-time</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formattedPricePerCredit} per credit
                      </p>
                    </div>
                    
                    <ul className="space-y-2">
                      {product.features.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <Check className="h-5 w-5 text-green-500 mr-2 shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full" 
                      variant={isBestValue ? "default" : "outline"}
                      onClick={() => handlePurchase(product.priceId)}
                      disabled={isLoading && loadingProductId === product.priceId}
                    >
                      {isLoading && loadingProductId === product.priceId ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Buy Now'
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
          
          <div className="mt-10 md:mt-16 text-center">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Frequently Asked Questions</h2>
            <div className="max-w-3xl mx-auto space-y-4 text-left">
              <div className="bg-card p-4 rounded-lg shadow-sm">
                <h3 className="font-semibold mb-2">How do credits work?</h3>
                <p className="text-sm text-muted-foreground">Each credit allows you to generate one image. Credits from one-time purchases never expire, so you can use them whenever you need them.</p>
              </div>
              <div className="bg-card p-4 rounded-lg shadow-sm">
                <h3 className="font-semibold mb-2">What payment methods do you accept?</h3>
                <p className="text-sm text-muted-foreground">We accept all major credit cards including Visa, Mastercard, American Express, and Discover through our secure payment processor, Stripe.</p>
              </div>
              <div className="bg-card p-4 rounded-lg shadow-sm">
                <h3 className="font-semibold mb-2">How soon can I use my credits?</h3>
                <p className="text-sm text-muted-foreground">Credits are added to your account instantly after successful payment. You can start generating images immediately.</p>
              </div>
              <div className="bg-card p-4 rounded-lg shadow-sm">
                <h3 className="font-semibold mb-2">Can I get a refund?</h3>
                <p className="text-sm text-muted-foreground">Due to the digital nature of our credits, all purchases are final. If you encounter any issues with our service, please contact our support team.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <footer className="py-6 px-4 border-t">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Xena AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

// Include supabase for fetching user profile
import { supabase } from '@/lib/supabase';