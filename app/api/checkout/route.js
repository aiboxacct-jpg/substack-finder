import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Creates a Stripe Checkout session for the logged-in user and returns its URL.
// The browser sends the user's Supabase access token; we verify it server-side
// so nobody can subscribe as someone else.
export async function POST(request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
      return Response.json(
        { error: 'Payments are not configured yet. Please try again later.' },
        { status: 500 }
      );
    }

    // Identify the user from their Supabase token.
    const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return Response.json({ error: 'Please log in first.' }, { status: 401 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin =
      request.headers.get('origin') || 'https://substack-finder.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: user.id,
      // Attach the Supabase user id so the webhook knows who paid.
      metadata: { supabase_user_id: user.id },
      subscription_data: { metadata: { supabase_user_id: user.id } },
      success_url: `${origin}/?subscribed=1`,
      cancel_url: `${origin}/`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return Response.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
    );
  }
}
