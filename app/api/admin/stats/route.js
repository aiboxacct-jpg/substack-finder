import { createClient } from '@supabase/supabase-js';
import { getAdminUser } from '@/lib/membership';

// Admin-only: our own visit stats (visits table, filled by /api/track).
// Same ADMIN_EMAIL gate as the other admin routes; reads via the service key.
// Aggregation happens in the database (visit_stats function in
// visits-table.sql), so this never pages through raw rows. Admin-flagged
// visits are excluded there.
//
// Returns { ranges: { d7, d30, all }, recent: [...] }.

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  if (!(await getAdminUser(token))) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const [d7, d30, all, recent] = await Promise.all([
    admin.rpc('visit_stats', { days: 7 }),
    admin.rpc('visit_stats', { days: 30 }),
    admin.rpc('visit_stats', { days: null }),
    admin
      .from('visits')
      .select('created_at, host, path, utm_campaign, utm_source, referrer_host')
      .eq('is_admin', false)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const err = d7.error || d30.error || all.error || recent.error;
  if (err) {
    console.error('Admin stats error:', err.message);
    return Response.json(
      { error: 'Could not read visit stats. Has visits-table.sql been run in Supabase?' },
      { status: 500 }
    );
  }

  return Response.json({
    ranges: { d7: d7.data, d30: d30.data, all: all.data },
    recent: recent.data || [],
  });
}
