import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { getAdminUser, getMembership } from '@/lib/membership';

// The public feature-request board. GET lists it; POST adds a suggestion.
// Voting and admin actions live in their own routes.

const MAX_TITLE_LENGTH = 120;

// Every request belongs to one tool, so the Finder's board never fills with
// Headline ideas and vice versa. 'general' = suite-wide, shown on the hub.
const TOOLS = new Set(['finder', 'headline', 'general']);

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request) {
  try {
    const token = (request.headers.get('authorization') || '').replace('Bearer ', '');

    // A tool page asks for its own requests only. The hub (and anything else)
    // gets the whole board, with each row carrying its tool tag.
    const toolParam = new URL(request.url).searchParams.get('tool');
    const tool = TOOLS.has(toolParam) && toolParam !== 'general' ? toolParam : null;

    // 'open' happens to sort before 'shipped' alphabetically, which is exactly
    // the display order: active ideas first, shipped history underneath, each
    // group most-wanted first.
    function baseQuery(columns) {
      let q = admin()
        .from('feature_requests')
        .select(columns)
        .order('status', { ascending: true })
        .order('votes', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(100);
      if (tool && columns.includes('tool')) q = q.eq('tool', tool);
      return q;
    }

    let { data, error } = await baseQuery('id, title, votes, status, tool, created_at');

    // Table predates the tool column (migration not yet run): serve the old
    // shape unfiltered rather than failing, labelling every row 'general'.
    if (error) {
      const fallback = await baseQuery('id, title, votes, status, created_at');
      if (!fallback.error) {
        data = (fallback.data || []).map((r) => ({ ...r, tool: 'general' }));
        error = null;
      }
    }

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

    // Which tool's board this was suggested from. Anything unrecognised lands
    // in 'general' rather than erroring, since the widget supplies this.
    const tool = TOOLS.has(body?.tool) ? body.tool : 'general';

    // Remember who suggested it when they are logged in. Never shown publicly;
    // it lets the admin follow up on a good idea.
    const { user } = await getMembership(token);

    const row = { title, email: user?.email || null };
    let res = await admin()
      .from('feature_requests')
      .insert({ ...row, tool })
      .select('id, title, votes, status, tool, created_at')
      .single();

    // Table predates the tool column: insert the old shape so the board keeps
    // working until the migration is run.
    if (res.error) {
      res = await admin()
        .from('feature_requests')
        .insert(row)
        .select('id, title, votes, status, created_at')
        .single();
      if (res.data) res.data.tool = 'general';
    }

    if (res.error || !res.data) {
      return Response.json({ error: 'Could not add that. Please try again.' }, { status: 500 });
    }

    return Response.json({ request: res.data });
  } catch {
    return Response.json({ error: 'Could not add that. Please try again.' }, { status: 500 });
  }
}
