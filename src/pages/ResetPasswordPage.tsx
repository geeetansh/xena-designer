import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

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

const resetPasswordSchema = z.object({
  password: passwordRequirements,
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const navigate = useNavigate();

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    // Check if we have valid parameters for password reset
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    
    if (!token_hash || type !== 'recovery') {
      toast.error('Invalid or missing reset password parameters');
      setIsVerifying(false);
      navigate('/login');
      return;
    }
    
    setToken(token_hash);
    setIsVerifying(false);
  }, [searchParams, navigate]);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!token) {
      toast.error('Missing reset token');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'recovery',
        new_password: values.password,
      });
      
      if (error) throw error;
      
      setResetSuccess(true);
      toast.success('Password has been reset successfully');
      
      // Redirect to login after a short delay
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (error: any) {
      toast.error(error.message || 'An error occurred during password reset');
      console.error('Password reset error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Password strength indicator
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

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Verifying reset token...</span>
      </div>
    );
  }

  if (resetSuccess) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="py-4 px-4 md:px-6 border-b">
          <div className="container mx-auto flex items-center justify-center">
            <img 
              src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6810f7c3918810c7e1a3fb13_Xena.png" 
              alt="Xena Logo" 
              className="h-7 w-auto" 
            />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 md:p-8">
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold">Password reset successful</CardTitle>
              <CardDescription>
                Your password has been successfully reset
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center py-6">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
              <p className="text-center text-muted-foreground mb-6">
                You can now log in with your new password
              </p>
              <Button 
                className="w-full"
                onClick={() => navigate('/login')}
              >
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </main>

        <footer className="py-4 px-4 md:px-6 border-t text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Xena AI. All rights reserved.
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header with logo */}
      <header className="py-4 px-4 md:px-6 border-b">
        <div className="container mx-auto flex items-center justify-center">
          <img 
            src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6810f7c3918810c7e1a3fb13_Xena.png" 
            alt="Xena Logo" 
            className="h-7 w-auto" 
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
            <CardDescription>
              Enter your new password below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
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
                      <FormLabel>Confirm New Password</FormLabel>
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

                <Button 
                  type="submit" 
                  className="w-full mt-6" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting password...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Remember your password?{' '}
              <Link 
                to="/login" 
                className="text-primary hover:underline font-medium"
              >
                Back to login
              </Link>
            </p>
          </CardFooter>
        </Card>
      </main>

      {/* Footer */}
      <footer className="py-4 px-4 md:px-6 border-t text-center">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Xena AI. All rights reserved.
        </p>
      </footer>
    </div>
  );
}