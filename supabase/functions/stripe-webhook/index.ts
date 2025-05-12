import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Products mapping from price ID to credit amount
// This should match src/stripe-config.ts
const PRODUCTS_CREDITS_MAP: Record<string, number> = {
  'price_1RMvZYF2bI4ojX8owZzL0B2T': 500, // 500 credits every month (subscription)
  'price_1RMvZAF2bI4ojX8oNRHofr8e': 1000, // 1000 credit topup
  'price_1RMvYxF2bI4ojX8oMHTLIdnu': 100, // 100 credit topup
  'price_1RMvYhF2bI4ojX8oY93qcb91': 10, // 10 credit topup
};

Deno.serve(async (req) => {
  console.log(`[Webhook] Received ${req.method} request`);
  
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      console.log(`[Webhook] Handling OPTIONS request`);
      return new Response(null, { status: 204 });
    }

    if (req.method !== 'POST') {
      console.log(`[Webhook] Invalid method: ${req.method}`);
      return new Response('Method not allowed', { status: 405 });
    }

    // get the signature from the header
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      console.log(`[Webhook] No signature found in headers`);
      return new Response('No signature found', { status: 400 });
    }

    // get the raw body
    const body = await req.text();
    console.log(`[Webhook] Received body length: ${body.length} bytes`);

    // verify the webhook signature
    let event: Stripe.Event;

    try {
      console.log(`[Webhook] Verifying signature: ${signature.substring(0, 20)}...`);
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
      console.log(`[Webhook] Signature verified successfully`);
    } catch (error: any) {
      console.error(`[Webhook] Signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, { status: 400 });
    }

    console.log(`[Webhook] Event type: ${event.type}, ID: ${event.id}`);
    EdgeRuntime.waitUntil(handleEvent(event));

    return Response.json({ received: true });
  } catch (error: any) {
    console.error(`[Webhook] Error processing webhook: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function handleEvent(event: Stripe.Event) {
  console.log(`[handleEvent] Processing event type: ${event.type}`);
  const stripeData = event?.data?.object ?? {};

  if (!stripeData) {
    console.log(`[handleEvent] No stripe data in event`);
    return;
  }

  if (!('customer' in stripeData)) {
    console.log(`[handleEvent] No customer in stripe data`);
    return;
  }

  // for one time payments, we only listen for the checkout.session.completed event
  if (event.type === 'payment_intent.succeeded' && event.data.object.invoice === null) {
    console.log(`[handleEvent] Ignoring payment_intent.succeeded for non-invoice payment`);
    return;
  }

  const { customer: customerId } = stripeData;

  if (!customerId || typeof customerId !== 'string') {
    console.error(`[handleEvent] No customer ID received on event: ${JSON.stringify(event)}`);
  } else {
    let isSubscription = true;

    if (event.type === 'checkout.session.completed') {
      const { mode } = stripeData as Stripe.Checkout.Session;

      isSubscription = mode === 'subscription';

      console.info(`[handleEvent] Processing ${isSubscription ? 'subscription' : 'one-time payment'} checkout session`);
    }

    const { mode, payment_status } = stripeData as Stripe.Checkout.Session;

    if (isSubscription) {
      console.info(`[handleEvent] Starting subscription sync for customer: ${customerId}`);
      await syncCustomerFromStripe(customerId);
    } else if (mode === 'payment' && payment_status === 'paid') {
      try {
        console.log(`[handleEvent] Processing one-time payment`);
        
        // Extract the necessary information from the session
        const {
          id: checkout_session_id,
          payment_intent,
          amount_subtotal,
          amount_total,
          currency,
        } = stripeData as Stripe.Checkout.Session;

        // Extract line items to get product information
        let productId = null;
        let productName = null;
        let creditsToAdd = 0;
        
        try {
          // Fetch the line items for this checkout session
          console.log(`[handleEvent] Fetching line items for checkout session: ${checkout_session_id}`);
          const lineItems = await stripe.checkout.sessions.listLineItems(checkout_session_id);
          
          if (lineItems.data.length > 0) {
            const lineItem = lineItems.data[0];
            console.log(`[handleEvent] Found line item: ${JSON.stringify(lineItem.description)}`);
            
            // Get the price ID for the first item
            const priceId = lineItem.price?.id;
            
            if (priceId) {
              productId = priceId;
              console.log(`[handleEvent] Found price ID: ${priceId}`);
              
              // Fetch the price to get the product details
              console.log(`[handleEvent] Retrieving price details from Stripe`);
              const price = await stripe.prices.retrieve(priceId, {
                expand: ['product']
              });
              
              // Extract product name
              if (price.product && typeof price.product !== 'string') {
                productName = price.product.name;
                console.log(`[handleEvent] Found product name for price ${priceId}: ${productName}`);
              } else if (lineItem.description) {
                // Fallback to line item description if product not available
                productName = lineItem.description;
                console.log(`[handleEvent] Using line item description as fallback: ${lineItem.description}`);
              }
              
              // Check if we know how many credits to add for this product
              if (priceId in PRODUCTS_CREDITS_MAP) {
                creditsToAdd = PRODUCTS_CREDITS_MAP[priceId];
                console.log(`[handleEvent] Product ${priceId} maps to ${creditsToAdd} credits`);
              } else {
                console.log(`[handleEvent] WARNING: Unknown product ${priceId}, no credit mapping found`);
              }
            }
            
            if (!productName && lineItem.description) {
              productName = lineItem.description;
              console.log(`[handleEvent] Using line item description: ${lineItem.description}`);
            }
          } else {
            console.log(`[handleEvent] No line items found for checkout session: ${checkout_session_id}`);
          }
        } catch (lineItemError) {
          console.error(`[handleEvent] Error fetching line items:`, lineItemError);
          // Continue without product ID or name
        }

        // Find the user ID associated with this customer
        console.log(`[handleEvent] Looking up user ID for customer: ${customerId}`);
        const { data: customerData, error: customerError } = await supabase
          .from('stripe_customers')
          .select('user_id')
          .eq('customer_id', customerId)
          .single();
          
        if (customerError) {
          console.error(`[handleEvent] Error finding user for customer ${customerId}:`, customerError);
          throw new Error(`Failed to find user for customer: ${customerError.message}`);
        }
        
        if (!customerData || !customerData.user_id) {
          console.error(`[handleEvent] No user found for customer: ${customerId}`);
          throw new Error('No user associated with this customer');
        }
        
        const userId = customerData.user_id;
        console.log(`[handleEvent] Found user ID ${userId} for customer ${customerId}`);

        // Insert the order into the stripe_orders table
        console.log(`[handleEvent] Inserting order into stripe_orders table`);
        const { error: orderError } = await supabase.from('stripe_orders').insert({
          checkout_session_id,
          payment_intent_id: payment_intent,
          customer_id: customerId,
          amount_subtotal,
          amount_total,
          currency,
          payment_status,
          status: 'completed', // assuming we want to mark it as completed since payment is successful
          product_id: productId, // Store the price ID for later reference
          product_name: productName, // Store the product name for display
          credits_added: creditsToAdd, // Store the number of credits added
        });

        if (orderError) {
          console.error(`[handleEvent] Error inserting order:`, orderError);
          throw new Error(`Failed to insert order: ${orderError.message}`);
        }
        
        console.log(`[handleEvent] Successfully inserted order record with ${creditsToAdd} credits`);
        
        // Add credits to the user's account based on the product purchased
        if (creditsToAdd > 0) {
          console.log(`[handleEvent] Adding ${creditsToAdd} credits to user ${userId}`);
          
          try {
            // Add credits to the user's profile using RPC function
            const { data, error: creditsError } = await supabase.rpc('add_credits', { 
              user_id_param: userId, 
              amount: creditsToAdd 
            });
            
            if (creditsError) {
              console.error(`[handleEvent] Error adding credits:`, creditsError);
              throw new Error(`Failed to add credits: ${creditsError.message}`);
            }
            
            console.log(`[handleEvent] Successfully added ${creditsToAdd} credits to user ${userId}`);
          } catch (creditsError) {
            console.error(`[handleEvent] Exception adding credits:`, creditsError);
            // Still consider the payment successful even if credits fail
          }
        } else {
          console.log(`[handleEvent] No credits to add for this product`);
        }
        
        console.info(`[handleEvent] Successfully processed one-time payment for session: ${checkout_session_id}`);
      } catch (error) {
        console.error(`[handleEvent] Error processing one-time payment:`, error);
      }
    }
  }
}

// based on the excellent https://github.com/t3dotgg/stripe-recommendations
async function syncCustomerFromStripe(customerId: string) {
  try {
    console.log(`[syncCustomerFromStripe] Syncing customer ${customerId} from Stripe`);
    
    // fetch latest subscription data from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method', 'data.items.data.price.product'],
    });

    // TODO verify if needed
    if (subscriptions.data.length === 0) {
      console.info(`[syncCustomerFromStripe] No active subscriptions found for customer: ${customerId}`);
      const { error: noSubError } = await supabase.from('stripe_subscriptions').upsert(
        {
          customer_id: customerId,
          subscription_status: 'not_started',
        },
        {
          onConflict: 'customer_id',
        },
      );

      if (noSubError) {
        console.error(`[syncCustomerFromStripe] Error updating subscription status:`, noSubError);
        throw new Error('Failed to update subscription status in database');
      }
    }

    // assumes that a customer can only have a single subscription
    const subscription = subscriptions.data[0];
    
    if (!subscription) {
      console.log(`[syncCustomerFromStripe] No subscription found, nothing to sync`);
      return;
    }
    
    console.log(`[syncCustomerFromStripe] Found subscription: ${subscription.id}, status: ${subscription.status}`);

    // store subscription state
    const { error: subError } = await supabase.from('stripe_subscriptions').upsert(
      {
        customer_id: customerId,
        subscription_id: subscription.id,
        price_id: subscription.items.data[0].price.id,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        ...(subscription.default_payment_method && typeof subscription.default_payment_method !== 'string'
          ? {
              payment_method_brand: subscription.default_payment_method.card?.brand ?? null,
              payment_method_last4: subscription.default_payment_method.card?.last4 ?? null,
            }
          : {}),
        status: subscription.status,
      },
      {
        onConflict: 'customer_id',
      },
    );

    if (subError) {
      console.error(`[syncCustomerFromStripe] Error syncing subscription:`, subError);
      throw new Error('Failed to sync subscription in database');
    }
    
    // Update credits for active subscriptions upon renewal
    if (subscription.status === 'active') {
      // Find the user ID for this customer
      console.log(`[syncCustomerFromStripe] Looking up user ID for customer: ${customerId}`);
      const { data: customerData, error: customerError } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('customer_id', customerId)
        .single();
        
      if (customerError) {
        console.error(`[syncCustomerFromStripe] Error finding user for customer ${customerId}:`, customerError);
        return;
      }
      
      if (!customerData || !customerData.user_id) {
        console.error(`[syncCustomerFromStripe] No user found for customer: ${customerId}`);
        return;
      }
      
      const userId = customerData.user_id;
      console.log(`[syncCustomerFromStripe] Found user ID ${userId} for customer ${customerId}`);
      
      // Get the price ID to determine the subscription plan
      const priceId = subscription.items.data[0].price.id;
      console.log(`[syncCustomerFromStripe] Subscription price ID: ${priceId}`);
      
      // Check if we know how many credits to add for this subscription
      if (priceId && PRODUCTS_CREDITS_MAP[priceId]) {
        const creditsToAdd = PRODUCTS_CREDITS_MAP[priceId];
        console.log(`[syncCustomerFromStripe] Adding ${creditsToAdd} subscription credits to user ${userId}`);
        
        try {
          // Add the subscription credits to the user's account
          const { data, error: creditsError } = await supabase.rpc('add_subscription_credits', { 
            user_id_param: userId, 
            amount: creditsToAdd 
          });
          
          if (creditsError) {
            console.error(`[syncCustomerFromStripe] Error adding subscription credits:`, creditsError);
          } else {
            console.log(`[syncCustomerFromStripe] Successfully added ${creditsToAdd} subscription credits to user ${userId}`);
          }
        } catch (error) {
          console.error(`[syncCustomerFromStripe] Exception adding subscription credits:`, error);
        }
      } else {
        console.log(`[syncCustomerFromStripe] No credit mapping found for price ID: ${priceId}`);
      }
    } else {
      console.log(`[syncCustomerFromStripe] Subscription status is ${subscription.status}, not adding credits`);
    }
    
    console.info(`[syncCustomerFromStripe] Successfully synced subscription for customer: ${customerId}`);
  } catch (error) {
    console.error(`[syncCustomerFromStripe] Failed to sync subscription for customer ${customerId}:`, error);
    throw error;
  }
}