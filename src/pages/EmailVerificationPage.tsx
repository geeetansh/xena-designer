import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function EmailVerificationPage() {
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState<string | null>(null);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Try to get email from location state (passed from LoginPage or SignUpPage)
    const stateEmail = location.state?.email;
    
    if (stateEmail) {
      setEmail(stateEmail);
    } else {
      // If no email in state, try to get current session
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user.email) {
          setEmail(data.session.user.email);
        } else {
          // If no email is found, redirect to login
          navigate('/login');
        }
      });
    }
  }, [location, navigate]);

  // Handle countdown for resend button
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && resendDisabled) {
      setResendDisabled(false);
    }
  }, [countdown, resendDisabled]);

  const handleInputChange = (index: number, value: string) => {
    // Allow only digits
    if (!/^\d*$/.test(value)) return;
    
    // Update the OTP array
    const newOtp = [...otp];
    newOtp[index] = value.slice(0, 1); // Only take the first character
    setOtp(newOtp);
    
    // Clear any previous error
    if (error) setError(null);
    
    // Auto-focus next input if value is entered
    if (value && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Move focus to previous input on backspace if current input is empty
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    
    // Move focus to next input on right arrow
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Move focus to previous input on left arrow
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const digits = pastedData.replace(/\D/g, '').substring(0, 6).split('');
    
    const newOtp = [...otp];
    digits.forEach((digit, index) => {
      if (index < 6) newOtp[index] = digit;
    });
    
    setOtp(newOtp);
    
    // Focus the next empty input or the last input if all are filled
    const nextEmptyIndex = newOtp.findIndex(val => !val);
    if (nextEmptyIndex >= 0 && nextEmptyIndex < 6) {
      inputRefs.current[nextEmptyIndex]?.focus();
    } else if (newOtp[5]) {
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpString = otp.join('');
    
    if (!email || !otpString || otpString.length !== 6) {
      setError("Please enter the 6-digit code sent to your email");
      return;
    }

    setVerifying(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otpString,
        type: 'email'
      });
      
      if (error) throw error;
      
      setSuccess(true);
      toast.success('Email verified successfully!');
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
      
    } catch (err) {
      console.error('Email verification error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during verification');
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setError("Email address is missing");
      return;
    }
    
    setResendDisabled(true);
    setCountdown(60); // 60 second cooldown
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false // Don't create new user, just send the verification email
        }
      });
      
      if (error) throw error;
      
      toast.success('A new verification code has been sent to your email');
    } catch (err) {
      console.error('Error sending verification code:', err);
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
      toast.error('Failed to send verification code');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="py-4 px-4 md:px-6 border-b">
        <div className="container mx-auto flex items-center justify-center">
          <img 
            src="https://cdn.prod.website-files.com/66f5c4825781318ac4e139f1/6810f7c3918810c7e1a3fb13_Xena.png" 
            alt="Xena Logo" 
            className="h-8 w-auto" 
          />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <Card className="w-full max-w-md">
          {success ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Email Verified</CardTitle>
                <CardDescription>
                  Your email has been successfully verified
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-6">
                <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Verification Successful!</h3>
                <p className="text-center text-muted-foreground mb-6">
                  Your email has been successfully verified. You can now access your account.
                </p>
                <Button 
                  className="w-full" 
                  onClick={() => navigate('/dashboard')}
                >
                  Continue to Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Email Verification</CardTitle>
                <CardDescription>
                  Enter the verification code sent to your email
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm mb-4">
                    {error}
                  </div>
                )}
                
                <div className="text-center mb-6">
                  <p className="text-sm text-muted-foreground">
                    We sent a 6-digit code to
                    <span className="font-medium text-foreground block mt-1">
                      {email || 'your email address'}
                    </span>
                  </p>
                </div>
                
                <div className="flex justify-center gap-2">
                  {otp.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleInputChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      className="w-10 h-12 text-center text-lg"
                      autoComplete="off"
                      disabled={verifying}
                    />
                  ))}
                </div>
                
                <Button 
                  className="w-full mt-4" 
                  onClick={handleVerify}
                  disabled={verifying || otp.some(digit => !digit)}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : 'Verify Email'}
                </Button>
                
                <div className="text-center mt-4">
                  <p className="text-sm text-muted-foreground mb-2">
                    Didn't receive a code?
                  </p>
                  <Button 
                    variant="ghost" 
                    onClick={handleResendCode} 
                    disabled={resendDisabled}
                  >
                    {resendDisabled 
                      ? `Resend code in ${countdown}s` 
                      : 'Resend verification code'}
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="flex justify-center border-t pt-4">
                <Button variant="outline" onClick={() => navigate('/login')}>
                  Back to Login
                </Button>
              </CardFooter>
            </>
          )}
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