import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { 
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

interface UserAuthFormProps {
  onAuthSuccess: () => void;
}

export function UserAuthForm({ onAuthSuccess }: UserAuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailVerificationAlert, setShowEmailVerificationAlert] = useState(false);
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setShowEmailVerificationAlert(false);
    
    try {
      // Attempt to sign in the user
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      // Handle error cases
      if (error) {
        // Special handling for email not confirmed error
        if (error.message.includes('Email not confirmed')) {
          setShowEmailVerificationAlert(true);
          throw new Error('Please check your email to confirm your account before logging in');
        } else {
          throw error;
        }
      }
      
      // If user has metadata.email_verified set to false, require verification
      const user = data.user;
      const isEmailVerified = user?.user_metadata?.email_verified === true;
      
      if (!isEmailVerified) {
        // If email not verified, sign out and show verification message
        await supabase.auth.signOut();
        setShowEmailVerificationAlert(true);
        throw new Error('Please verify your email before signing in');
      }
      
      toast({
        title: "Sign in successful",
        description: "Welcome back!",
      });
      
      onAuthSuccess();
    } catch (error) {
      toast({
        title: "Sign in failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Use current origin for redirect URL to avoid localhost issues
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        }
      });
      
      if (error) throw error;
      
      setShowEmailVerificationAlert(true);
      toast({
        title: "Account created",
        description: "Check your email to confirm your account",
      });
    } catch (error) {
      toast({
        title: "Sign up failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to resend verification email
  const handleResendVerification = async () => {
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address to resend verification",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "Verification email sent",
        description: "Please check your inbox for the verification link",
      });
    } catch (error) {
      toast({
        title: "Failed to resend email",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <Tabs defaultValue="signin">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Xena - Fully autonomous designer</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account to start generating images
          </CardDescription>
          <TabsList className="grid grid-cols-2 mt-4">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
        </CardHeader>
        
        <CardContent>
          {showEmailVerificationAlert && (
            <Alert className="mb-4 border-amber-500/50 bg-amber-500/10">
              <Mail className="h-4 w-4 text-amber-500" />
              <AlertTitle>Email verification required</AlertTitle>
              <AlertDescription className="mt-1">
                Please check your email to confirm your account before logging in.
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-amber-600 font-medium"
                  onClick={handleResendVerification}
                  disabled={isLoading}
                >
                  Resend verification email
                </Button>
              </AlertDescription>
            </Alert>
          )}
          
          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-signup">Email</Label>
                <Input
                  id="email-signup"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-signup">Password</Label>
                <Input
                  id="password-signup"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              {!showEmailVerificationAlert && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Email Verification Required</AlertTitle>
                  <AlertDescription>
                    You'll need to verify your email address before you can log in.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Sign Up'
                )}
              </Button>
            </form>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}