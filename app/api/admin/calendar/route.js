import { createClient } from '@supabase/supabase-js';
import { getAdminUser } from '@/lib/membership';

// Live content calendar: list, add, edit, delete Notes / replies / posts.
// Gated on ADMIN_EMAIL like every other admin route.

const KINDS = ['note', 'reply', 'post'];
const STATUSES = ['idea', 'draft', 'approved', 'scheduled', 'live'];
const FIELDS = ['kind', 'status', 'title', 'body', 'link', 'campaign', 'scheduled_for', 'posted_at', 'notes'];

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function gate(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  return getAdminUser(token);
}

const isId = (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

// Keep only known fields, trim strings, turn blanks into null.
function clean(input, { requireTitle }) {
  const row = {};
  for (const f of FIELDS) {
    if (!(f in input)) continue;
    let v = input[f];
    if (typeof v === 'string') v = v.trim();
    row[f] = v === '' || v === undefined ? null : v;
  }
  if (requireTitle && !row.title) return { error: 'Title is required.' };
  if ('title' in row && !row.title) return { error: 'Title is required.' };
  if (row.title && row.title.length > 300) return { error: 'Title is too long.' };
  if ('kind' in row && !KINDS.includes(row.kind)) return { error: 'Unknown type.' };
  if ('status' in row && !STATUSES.includes(row.status)) return { error: 'Unknown status.' };
  if (row.link && !/^https?:\/\//i.test(row.link)) return { error: 'Link must start with http.' };
  return { row };
}

export async function GET(request) {
  if (!(await gate(request))) return Response.json({ error: 'Not authorized' }, { status: 401 });
  const { data, error } = await db()
    .from('content_calendar')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    return Response.json(
      { error: 'Calendar table not found. Run content-calendar-table.sql in Supabase.' },
      { status: 500 }
    );
  }
  return Response.json({ items: data });
}

export async function POST(request) {
  if (!(await gate(request))) return Response.json({ error: 'Not authorized' }, { status: 401 });
  try {
    const { row, error } = clean(await request.json(), { requireTitle: true });
    if (error) return Response.json({ error }, { status: 400 });
    if (row.status === 'live' && !row.posted_at) row.posted_at = new Date().toISOString();
    const res = await db().from('content_calendar').insert(row).select('*').single();
    if (res.error) return Response.json({ error: 'Could not save.' }, { status: 500 });
    return Response.json({ item: res.data });
  } catch {
    return Response.json({ error: 'Could not save.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!(await gate(request))) return Response.json({ error: 'Not authorized' }, { status: 401 });
  try {
    const body = await request.json();
    if (!isId(body.id)) return Response.json({ error: 'Unknown item.' }, { status: 400 });
    const { row, error } = clean(body, { requireTitle: false });
    if (error) return Response.json({ error }, { status: 400 });
    if (row.status === 'live' && !('posted_at' in row)) {
      // Stamp the go-live time once, without overwriting an earlier one.
      const cur = await db().from('content_calendar').select('posted_at').eq('id', body.id).single();
      if (!cur.data?.posted_at) row.posted_at = new Date().toISOString();
    }
    row.updated_at = new Date().toISOString();
    const res = await db().from('content_calendar').update(row).eq('id', body.id).select('*').single();
    if (res.error) return Response.json({ error: 'Could not save.' }, { status: 500 });
    return Response.json({ item: res.data });
  } catch {
    return Response.json({ error: 'Could not save.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await gate(request))) return Response.json({ error: 'Not authorized' }, { status: 401 });
  try {
    const { id } = await request.json();
    if (!isId(id)) return Response.json({ error: 'Unknown item.' }, { status: 400 });
    const res = await db().from('content_calendar').delete().eq('id', id);
    if (res.error) return Response.json({ error: 'Could not delete.' }, { status: 500 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Could not delete.' }, { status: 500 });
  }
}
