import { createClient } from '@supabase/supabase-js';

// Supabase's free plan pauses a project after about a week with no database
// activity, which takes the ideas board and saved data offline. Vercel Cron
// calls this once a day; one tiny read counts as activity and keeps it awake.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Only Vercel Cron (or someone with the secret) can trigger this.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await admin.from('feature_requests').select('id').limit(1);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, at: new Date().toISOString() });
}
