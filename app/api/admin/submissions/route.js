import { createClient } from '@supabase/supabase-js';

// Verify the caller is the admin (same gate as /api/admin/users). Returns the
// admin service client on success, or a Response to return on failure.
async function requireAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) return { error: Response.json({ error: 'Not authorized' }, { status: 401 }) };

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const {
    data: { user },
  } = await anon.auth.getUser(token);
  if (!user) return { error: Response.json({ error: 'Not authorized' }, { status: 401 }) };

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!adminEmail || (user.email || '').toLowerCase() !== adminEmail) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return { admin };
}

// List all submissions (pending first, then newest).
export async function GET(request) {
  const { admin, error: gate } = await requireAdmin(request);
  if (gate) return gate;

  const { data, error } = await admin
    .from('submissions')
    .select('id, name, url, description, tags, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Admin submissions query error:', error.message);
    return Response.json({ error: 'Could not load submissions.' }, { status: 500 });
  }

  const order = { pending: 0, approved: 1, rejected: 2 };
  const submissions = [...(data || [])].sort(
    (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
  );
  const pending = submissions.filter((s) => s.status === 'pending').length;
  return Response.json({ submissions, pending });
}

// Approve / reject / delete a submission.
export async function POST(request) {
  const { admin, error: gate } = await requireAdmin(request);
  if (gate) return gate;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { id, action } = body || {};
  if (!id || !['approve', 'reject', 'delete'].includes(action)) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  let error;
  if (action === 'delete') {
    ({ error } = await admin.from('submissions').delete().eq('id', id));
  } else {
    const status = action === 'approve' ? 'approved' : 'rejected';
    ({ error } = await admin.from('submissions').update({ status }).eq('id', id));
  }

  if (error) {
    console.error('Admin submissions update error:', error.message);
    return Response.json({ error: 'Could not update the submission.' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
