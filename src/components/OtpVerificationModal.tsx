import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface OtpVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onSuccess: () => void;
  onError?: (error: string) => void;
}

export function OtpVerificationModal({
  open,
  onOpenChange,
  email,
  onSuccess,
  onError
}: OtpVerificationModalProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const navigate = useNavigate();

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

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setOtp(['', '', '', '', '', '']);
      setError(null);
      setVerifying(false);
      // Focus the first input when the modal opens
      setTimeout(() => {
        if (inputRefs.current[0]) {
          inputRefs.current[0].focus();
        }
      }, 100);
    }
  }, [open]);

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

  const handleVerify = async () => {
    const otpString = otp.join('');
    
    if (!email || !otpString || otpString.length !== 6) {
      const errorMsg = "Please enter the 6-digit code sent to your email";
      setError(errorMsg);
      if (onError) onError(errorMsg);
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
      
      if (error) {
        // Check if the error is related to expired or invalid token
        if (error.message.includes('expired') || error.message.includes('invalid')) {
          throw new Error('OTP expired or invalid, please resend the verification code and try again.');
        }
        throw error;
      }
      
      toast.success('Email verified successfully!');
      onSuccess();
      onOpenChange(false);
      
    } catch (err) {
      console.error('Email verification error:', err);
      const errorMsg = err instanceof Error ? err.message : 'An error occurred during verification';
      setError(errorMsg);
      if (onError) onError(errorMsg);
    } finally {
      setVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      const errorMsg = "Email address is missing";
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }
    
    setResendDisabled(true);
    setCountdown(60); // 60 second cooldown
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false // Don't create new user, just send the verification code
        }
      });
      
      if (error) throw error;
      
      toast.success('A new verification code has been sent to your email');
    } catch (err) {
      console.error('Error sending verification code:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to send verification code';
      setError(errorMsg);
      if (onError) onError(errorMsg);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify your email</DialogTitle>
          <DialogDescription>
            Enter the 6-digit code sent to your email
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col space-y-4 py-4">
          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
          
          <div className="text-center mb-2">
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to
              <span className="font-medium text-foreground block mt-1">
                {email}
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
          
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Didn't receive a code?
            </p>
            <Button 
              variant="ghost" 
              onClick={handleResendCode} 
              disabled={resendDisabled}
              type="button"
              size="sm"
            >
              {resendDisabled 
                ? `Resend code in ${countdown}s` 
                : 'Resend verification code'}
            </Button>
          </div>
        </div>
        
        <DialogFooter>
          <Button 
            onClick={handleVerify}
            disabled={verifying || otp.some(digit => !digit)}
            className="w-full"
          >
            {verifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : 'Verify Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}