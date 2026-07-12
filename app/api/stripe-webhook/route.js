import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Stripe calls this endpoint when something happens (payment succeeds, a
// subscription changes or cancels). We verify it's really from Stripe, then
// update the user's row in Supabase (is_subscribed). Runs server-side with the
// Supabase SECRET key, which bypasses row-level security to write any profile.
export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  async function setSubscription(userId, isSubscribed, fields = {}) {
    if (!userId) return;
    const { error } = await admin
      .from('profiles')
      .update({
        is_subscribed: isSubscribed,
        updated_at: new Date().toISOString(),
        ...fields,
      })
      .eq('id', userId);
    if (error) console.error('Supabase update error:', error.message);
  }

  try {
    switch (event.type) {
      // A checkout finished successfully → mark them a member.
      case 'checkout.session.completed': {
        const s = event.data.object;
        const userId = s.metadata?.supabase_user_id || s.client_reference_id;
        await setSubscription(userId, true, {
          stripe_customer_id: s.customer,
          stripe_subscription_id: s.subscription,
          subscription_status: 'active',
        });
        break;
      }
      // Subscription renewed / changed / canceled → follow its status.
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        const active = sub.status === 'active' || sub.status === 'trialing';
        await setSubscription(userId, active, {
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
        });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 200 so Stripe doesn't retry forever on a data hiccup.
    return Response.json({ received: true, note: 'handler error logged' });
  }

  return Response.json({ received: true });
}
