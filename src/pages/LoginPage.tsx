import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/posthog';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { OtpVerificationModal } from '@/components/OtpVerificationModal';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const navigate = useNavigate();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    
    try {
      // Track login attempt
      trackEvent('login_attempt', { email_domain: values.email.split('@')[1] });
      
      // First attempt to sign in with password
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      
      if (error) {
        // Special case for unverified users
        if (error.message.includes('Email not confirmed')) {
          setUnverifiedEmail(values.email);
          setIsOtpModalOpen(true);
          
          // Track verification needed
          trackEvent('login_verification_needed');
          
          throw new Error('Verify your account by entering the OTP sent to your email.');
        }
        
        // Track login failure
        trackEvent('login_failed', { reason: error.message });
        
        throw error;
      }
      
      // Track login success
      trackEvent('login_success');
      
      toast.success('Logged in successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'An error occurred during login');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationSuccess = () => {
    toast.success('Email verified successfully!');
    
    // Track verification success
    trackEvent('email_verification_success');
    
    // Allow the user to login now
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header with logo */}
      <header className="py-4 px-4 md:px-6 border-b">
        <div className="container mx-auto flex items-center justify-center">
          <img 
            src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6810f7c3918810c7e1a3fb13_Xena.png" 
            alt="Xena Logo" 
            className="h-8 w-auto" 
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
            <CardDescription>
              Log in to your Xena AI account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="you@example.com" 
                          type="email" 
                          autoComplete="email"
                          disabled={isLoading}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <Link 
                          to="#" 
                          className="text-sm font-medium text-primary hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            const email = form.getValues('email');
                            if (!email) {
                              toast.error("Please enter your email first");
                              return;
                            }
                            
                            trackEvent('password_reset_requested');
                            
                            supabase.auth.resetPasswordForEmail(email, {
                              redirectTo: `${window.location.origin}/reset-password`,
                            }).then(({ error }) => {
                              if (error) {
                                toast.error(error.message);
                                trackEvent('password_reset_failed', { reason: error.message });
                              } else {
                                toast.success("Password reset email sent. Check your inbox.");
                                trackEvent('password_reset_email_sent');
                              }
                            });
                          }}
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            placeholder="••••••••" 
                            type={showPassword ? "text" : "password"} 
                            autoComplete="current-password"
                            disabled={isLoading}
                            {...field} 
                          />
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="sm" 
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={togglePasswordVisibility}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full mt-6" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    'Log In'
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link 
                to="/sign-up" 
                className="text-primary hover:underline font-medium"
                onClick={() => trackEvent('signup_link_clicked')}
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </main>

      {/* OTP Verification Modal */}
      <OtpVerificationModal
        open={isOtpModalOpen}
        onOpenChange={setIsOtpModalOpen}
        email={unverifiedEmail}
        onSuccess={handleVerificationSuccess}
        onError={(error) => {
          toast.error(error);
          trackEvent('email_verification_failed', { error });
        }}
      />

      {/* Footer */}
      <footer className="py-4 px-4 md:px-6 border-t text-center">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Xena AI. All rights reserved.
        </p>
      </footer>
    </div>
  );
}