import { createClient } from '@supabase/supabase-js';

// Upvote a feature request. One vote per visitor per idea, enforced two ways:
// the widget remembers votes in localStorage (survives deploys, per-browser),
// and this route keeps an in-memory guard per IP (shared across browsers,
// resets on deploy). Neither is bulletproof alone; together they are plenty
// for a suggestion box, without tracking anyone.
const voted = new Set(); // "ip|id"
const MAX_GUARD = 20000; // drop the guard wholesale if it somehow balloons

export async function POST(request) {
  try {
    const ip =
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const { id } = await request.json();

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return Response.json({ error: 'Unknown request.' }, { status: 400 });
    }

    const key = `${ip}|${id}`;
    if (voted.has(key)) {
      // Repeat vote: succeed quietly rather than error. The widget already
      // shows it as voted; there is nothing useful to tell the user.
      return Response.json({ ok: true, already: true });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Read-then-write rather than an atomic increment: supabase-js has no
    // expression updates without an RPC, and losing the odd concurrent vote
    // on a suggestion box is not worth a database function.
    const { data: row } = await admin
      .from('feature_requests')
      .select('votes, status')
      .eq('id', id)
      .single();

    if (!row) {
      return Response.json({ error: 'Unknown request.' }, { status: 404 });
    }
    if (row.status !== 'open') {
      return Response.json({ error: 'That one has already shipped.' }, { status: 400 });
    }

    const { error } = await admin
      .from('feature_requests')
      .update({ votes: row.votes + 1 })
      .eq('id', id);

    if (error) {
      return Response.json({ error: 'Could not vote. Please try again.' }, { status: 500 });
    }

    if (voted.size > MAX_GUARD) voted.clear();
    voted.add(key);

    return Response.json({ ok: true, votes: row.votes + 1 });
  } catch {
    return Response.json({ error: 'Could not vote. Please try again.' }, { status: 500 });
  }
}
