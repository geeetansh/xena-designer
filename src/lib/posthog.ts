import posthog from 'posthog-js'
import { useMemo } from 'react'

// Get PostHog keys from environment variables, checking both formats
export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || 
                          import.meta.env.REACT_APP_PUBLIC_POSTHOG_KEY || 
                          ''
                          
export const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 
                           import.meta.env.REACT_APP_PUBLIC_POSTHOG_HOST || 
                           'https://us.posthog.com'

// Initialize PostHog
export const initPostHog = () => {
  if (!POSTHOG_KEY) {
    console.warn('PostHog API key not found. Analytics will not be captured.')
    return
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true, // Automatically capture pageviews
    capture_pageleave: true, // Capture when users leave the page
    autocapture: true, // Automatically capture clicks, form submissions, etc.
    persistence: 'localStorage', // Use localStorage to persist the distinct_id
    loaded: (posthog) => {
      console.log('PostHog loaded successfully')
      
      // If we're in development, optionally disable capturing
      if (import.meta.env.DEV) {
        // Uncomment to disable capturing in development
        // posthog.opt_out_capturing()
      }
    }
  })
}

// Helper function to identify users with their ID and properties
export const identifyUser = (userId: string, userProperties?: Record<string, any>) => {
  if (!POSTHOG_KEY) return
  
  posthog.identify(userId, userProperties)
  console.log(`User identified in PostHog: ${userId}`)
}

// Helper function to reset the user's identity on logout
export const resetUser = () => {
  if (!POSTHOG_KEY) return
  
  posthog.reset()
  console.log('User reset in PostHog')
}

// Helper function to track events
export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  if (!POSTHOG_KEY) return
  
  posthog.capture(eventName, properties)
  console.log(`Tracked event: ${eventName}`, properties)
}

export const usePostHog = () => {
  return useMemo(() => {
    return {
      identify: identifyUser,
      reset: resetUser,
      track: trackEvent,
      posthog
    }
  }, [])
}