import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { getAdminUser, getMembership } from '@/lib/membership';

// The public feature-request board. GET lists it; POST adds a suggestion.
// Voting and admin actions live in their own routes.

const MAX_TITLE_LENGTH = 120;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request) {
  try {
    const token = (request.headers.get('authorization') || '').replace('Bearer ', '');

    // 'open' happens to sort before 'shipped' alphabetically, which is exactly
    // the display order: active ideas first, shipped history underneath, each
    // group most-wanted first.
    const { data, error } = await admin()
      .from('feature_requests')
      .select('id, title, votes, status, created_at')
      .order('status', { ascending: true })
      .order('votes', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      return Response.json({ error: 'Could not load requests.' }, { status: 500 });
    }

    // Tells the widget whether to show the Ship/Delete controls. The server
    // re-checks on every admin action, so this is cosmetic, not the gate.
    const isAdmin = !!(await getAdminUser(token));

    return Response.json({ requests: data || [], isAdmin });
  } catch {
    return Response.json({ error: 'Could not load requests.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const ip =
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const token = (request.headers.get('authorization') || '').replace('Bearer ', '');

    const body = await request.json();
    const title = (body?.title || '').trim().replace(/\s+/g, ' ');

    if (title.length < 3) {
      return Response.json({ error: 'Please describe the feature.' }, { status: 400 });
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return Response.json(
        { error: `Please keep it under ${MAX_TITLE_LENGTH} characters.` },
        { status: 400 }
      );
    }
    // A public unauthenticated text box is a spam magnet; links are the main
    // payload, so they are simply not allowed here.
    if (/https?:\/\/|www\./i.test(title)) {
      return Response.json(
        { error: 'Links are not allowed in requests.' },
        { status: 400 }
      );
    }

    // Namespaced so this shares the limiter map without sharing the counter
    // with anything else: 10 suggestions per hour per visitor.
    const limit = checkRateLimit(`feature-add:${ip}`);
    if (!limit.allowed) {
      return Response.json(
        { error: 'That is plenty of ideas for now. Try again in an hour.' },
        { status: 429 }
      );
    }

    // Remember who suggested it when they are logged in. Never shown publicly;
    // it lets the admin follow up on a good idea.
    const { user } = await getMembership(token);

    const { data, error } = await admin()
      .from('feature_requests')
      .insert({ title, email: user?.email || null })
      .select('id, title, votes, status, created_at')
      .single();

    if (error || !data) {
      return Response.json({ error: 'Could not add that. Please try again.' }, { status: 500 });
    }

    return Response.json({ request: data });
  } catch {
    return Response.json({ error: 'Could not add that. Please try again.' }, { status: 500 });
  }
}
