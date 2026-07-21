import { createClient } from '@supabase/supabase-js';

// Admin-only: the most recent match searches (which Substacks people pasted in).
// Same ADMIN_EMAIL gate as the other admin routes; reads via the service key.
export async function GET(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Not authorized' }, { status: 401 });

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const {
    data: { user },
  } = await anon.auth.getUser(token);
  if (!user) return Response.json({ error: 'Not authorized' }, { status: 401 });

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!adminEmail || (user.email || '').toLowerCase() !== adminEmail) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  // Prefer the fullest shape: which tool, and how the run turned out. Each
  // migration was applied at a different time (searches-tool-column.sql, then
  // searches-outcome-columns.sql), so fall back through the older shapes rather
  // than failing outright if one hasn't been run yet.
  let { data, error } = await admin
    .from('searches')
    .select('topic, email, tool, outcome, result_count, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    const withTool = await admin
      .from('searches')
      .select('topic, email, tool, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!withTool.error) {
      data = withTool.data || [];
      error = null;
    } else {
      const basic = await admin
        .from('searches')
        .select('topic, email, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!basic.error) {
        data = (basic.data || []).map((row) => ({ ...row, tool: 'finder' }));
        error = null;
      }
    }
  }

  if (error) {
    console.error('Admin searches query error:', error.message);
    return Response.json({ error: 'Could not load searches.' }, { status: 500 });
  }

  return Response.json({ searches: data || [] });
}
