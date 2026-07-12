import { createClient } from '@supabase/supabase-js';

// Admin-only: returns the list of signups + subscription status. Locked to the
// email in ADMIN_EMAIL. The gate runs BEFORE any data is read, so a non-admin
// never receives user data. Uses the service key (server-only) to bypass RLS.
export async function GET(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const {
    data: { user },
  } = await anon.auth.getUser(token);
  if (!user) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!adminEmail || (user.email || '').toLowerCase() !== adminEmail) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data, error } = await admin
    .from('profiles')
    .select('email, is_subscribed, subscription_status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Admin query error:', error.message);
    return Response.json({ error: 'Could not load users.' }, { status: 500 });
  }

  const members = data.filter((p) => p.is_subscribed).length;
  return Response.json({
    users: data,
    total: data.length,
    members,
    free: data.length - members,
  });
}
