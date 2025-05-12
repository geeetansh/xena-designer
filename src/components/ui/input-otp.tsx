import * as React from "react"
import { OTPInput, SlotProps } from "input-otp"
import { cn } from "@/lib/utils"
import { cva } from "class-variance-authority"

const inputOTPVariants = cva(
  "flex h-10 items-center justify-center rounded-md border border-input bg-transparent text-sm ring-offset-background placeholder:text-muted-foreground focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-8",
        md: "h-10",
        lg: "h-12",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput> & {
    size?: "sm" | "md" | "lg"
  }
>(({ className, containerClassName, size, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={cn(
      "flex items-center gap-2",
      containerClassName
    )}
    className={cn(inputOTPVariants({ size }), className)}
    {...props}
  />
))
InputOTP.displayName = "InputOTP"

const InputOTPGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-2", className)}
    {...props}
  />
))
InputOTPGroup.displayName = "InputOTPGroup"

const inputOTPSlotVariants = cva(
  "flex h-full w-10 items-center justify-center rounded-md border border-input bg-transparent text-base ring-offset-background focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "w-8 text-sm",
        md: "w-10 text-base",
        lg: "w-12 text-lg",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

const InputOTPSlot = React.forwardRef<
  React.ElementRef<"div">,
  SlotProps & { size?: "sm" | "md" | "lg" }
>(({ char, hasFakeCaret, isActive, className, size, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        inputOTPSlotVariants({ size }),
        isActive && "border-primary",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-500" />
        </div>
      )}
    </div>
  )
})
InputOTPSlot.displayName = "InputOTPSlot"

export { InputOTP, InputOTPGroup, InputOTPSlot }