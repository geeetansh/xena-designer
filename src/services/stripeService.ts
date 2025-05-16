// stripeService.ts - Services for Stripe integration
import { supabase } from '@/lib/supabase';
import { products, getProductByPriceId } from '@/stripe-config';

// Create a checkout session
export async function createCheckoutSession(priceId: string, successUrl: string, cancelUrl: string) {
  try {
    const product = getProductByPriceId(priceId);
    
    if (!product) {
      throw new Error('Invalid product selected');
    }
    
    // Get the current session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('You must be logged in to make a purchase');
    }
    
    // Call the Supabase Edge Function to create a checkout session
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        price_id: priceId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        mode: product.mode
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create checkout session');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
}

// Get user's subscription status
export async function getUserSubscription() {
  try {
    const { data, error } = await supabase
      .from('stripe_user_subscriptions')
      .select('*')
      .maybeSingle();
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    throw error;
  }
}

// Get user's order history
export async function getUserOrders() {
  try {
    const { data, error } = await supabase
      .from('stripe_user_orders')
      .select('*')
      .order('order_date', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    return data || [];
  } catch (error) {
    console.error('Error fetching orders:', error);
    throw error;
  }
}

// Format currency for display
export function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount / 100); // Stripe amounts are in cents
}

// Check if user has an active subscription
export async function hasActiveSubscription() {
  try {
    const subscription = await getUserSubscription();
    return subscription && subscription.subscription_status === 'active';
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
}

// Get subscription details including product information
export async function getSubscriptionDetails() {
  try {
    const subscription = await getUserSubscription();
    
    if (!subscription || !subscription.price_id) {
      return null;
    }
    
    const product = getProductByPriceId(subscription.price_id);
    
    if (!product) {
      return subscription;
    }
    
    return {
      ...subscription,
      product
    };
  } catch (error) {
    console.error('Error fetching subscription details:', error);
    throw error;
  }
}

// Get user's current credit balance
export async function getUserCredits() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const { data, error } = await supabase
      .from('user_profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      throw error;
    }
    
    return data?.credits || 0;
  } catch (error) {
    console.error('Error fetching user credits:', error);
    return 0;
  }
}