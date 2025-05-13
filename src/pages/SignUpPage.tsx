import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  FormDescription,
} from '@/components/ui/form';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { OtpVerificationModal } from '@/components/OtpVerificationModal';

// Password requirements based on Supabase settings
const passwordRequirements = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password is too long')
  .refine(
    (password) => /[a-z]/.test(password),
    "Password must contain at least one lowercase letter"
  )
  .refine(
    (password) => /[A-Z]/.test(password),
    "Password must contain at least one uppercase letter"
  )
  .refine(
    (password) => /[0-9]/.test(password),
    "Password must contain at least one digit"
  );

const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: passwordRequirements,
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SignUpFormValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
    mode: "onChange",
  });

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  const onSubmit = async (values: SignUpFormValues) => {
    setIsLoading(true);
    
    try {
      // Track signup attempt
      trackEvent('signup_started', {
        email_domain: values.email.split('@')[1]
      });
      
      // Create user with OTP verification
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        }
      });
      
      if (error) throw error;
      
      // Store email and password for later use
      setEmail(values.email);
      setPassword(values.password);
      
      // Show success message and prompt for OTP verification
      toast.success('Account created successfully! Please verify your email with the code sent to your inbox.');
      
      // Track signup success
      trackEvent('signup_completed');
      
      // Open OTP verification modal
      setIsOtpModalOpen(true);
      
    } catch (error: any) {
      // Parse error response for more specific error messages
      if (typeof error.message === 'string') {
        toast.error(error.message || 'An error occurred during sign up');
      } else {
        toast.error('An unexpected error occurred. Please try again.');
      }
      
      // Track signup error
      trackEvent('signup_failed', {
        reason: error.message
      });
      
      console.error('Sign up error:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleVerificationSuccess = () => {
    toast.success('Email verified successfully!');
    
    // Track verification success
    trackEvent('email_verification_success');
    
    // Sign in the user automatically
    supabase.auth.signInWithPassword({
      email,
      password
    }).then(({ error }) => {
      if (error) {
        toast.error('Verification successful, but sign-in failed. Please sign in manually.');
        navigate('/login');
        
        // Track auto-signin failure
        trackEvent('auto_signin_failed', {
          reason: error.message
        });
      } else {
        navigate('/dashboard');
        
        // Track auto-signin success
        trackEvent('auto_signin_success');
      }
    });
  };

  // Password strength indicator that accounts for length, uppercase, lowercase, and digits
  const getPasswordStrength = (password: string) => {
    if (!password) return 0;
    
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength += 1;
    
    // Lowercase check
    if (/[a-z]/.test(password)) strength += 1;
    
    // Uppercase check
    if (/[A-Z]/.test(password)) strength += 1;
    
    // Digit check
    if (/[0-9]/.test(password)) strength += 1;

    return strength;
  };

  const passwordValue = form.watch("password");
  const passwordStrength = getPasswordStrength(passwordValue);

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
            <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
            <CardDescription>
              Sign up to start using Xena AI
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
                      <FormDescription>
                        We'll send a verification code to this email.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            placeholder="••••••••" 
                            type={showPassword ? "text" : "password"} 
                            autoComplete="new-password"
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
                      
                      {/* Password strength meter */}
                      {field.value && (
                        <div className="mt-2">
                          <div className="flex items-center space-x-1">
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden flex">
                              {[...Array(4)].map((_, i) => (
                                <div
                                  key={i}
                                  className={`h-full flex-1 ${
                                    i < passwordStrength
                                      ? passwordStrength === 1
                                        ? "bg-destructive"
                                        : passwordStrength === 2
                                        ? "bg-orange-500"
                                        : passwordStrength === 3
                                        ? "bg-yellow-500"
                                        : "bg-green-500"
                                      : "bg-transparent"
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-xs w-24">
                              {passwordStrength === 0 && "Very weak"}
                              {passwordStrength === 1 && "Weak"}
                              {passwordStrength === 2 && "Fair"}
                              {passwordStrength === 3 && "Good"}
                              {passwordStrength === 4 && "Strong"}
                            </span>
                          </div>
                          
                          <div className="text-xs mt-2 space-y-1 text-muted-foreground">
                            <div className="flex items-center">
                              <div className={`w-3 h-3 rounded-full mr-2 ${/[a-z]/.test(field.value) ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                              <span>Lowercase letter</span>
                            </div>
                            <div className="flex items-center">
                              <div className={`w-3 h-3 rounded-full mr-2 ${/[A-Z]/.test(field.value) ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                              <span>Uppercase letter</span>
                            </div>
                            <div className="flex items-center">
                              <div className={`w-3 h-3 rounded-full mr-2 ${/[0-9]/.test(field.value) ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                              <span>Number</span>
                            </div>
                            <div className="flex items-center">
                              <div className={`w-3 h-3 rounded-full mr-2 ${field.value.length >= 8 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                              <span>At least 8 characters</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            placeholder="••••••••" 
                            type={showConfirmPassword ? "text" : "password"} 
                            autoComplete="new-password"
                            disabled={isLoading}
                            {...field} 
                          />
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="sm" 
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={toggleConfirmPasswordVisibility}
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="mt-6">
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Email Verification Required</AlertTitle>
                    <AlertDescription>
                      After signing up, you'll need to verify your email address with a code sent to your inbox.
                    </AlertDescription>
                  </Alert>
                </div>

                <Button 
                  type="submit" 
                  className="w-full mt-6" 
                  disabled={isLoading || !form.formState.isValid}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link 
                to="/login" 
                className="text-primary hover:underline font-medium"
                onClick={() => trackEvent('login_link_clicked')}
              >
                Log in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </main>

      {/* OTP Verification Modal */}
      <OtpVerificationModal
        open={isOtpModalOpen}
        onOpenChange={setIsOtpModalOpen}
        email={email}
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