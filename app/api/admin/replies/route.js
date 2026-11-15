import { createClient } from '@supabase/supabase-js';
import { getAdminUser } from '@/lib/membership';

// Replies inbox: pulls the replies people left on our live Notes and posts
// (from the content calendar) using Substack's public comment endpoints, so
// Matt doesn't have to go looking. Our own replies are filtered out, and each
// reply says whether we've already answered it.

const OUR_USER_ID = 523797109; // the Stack Tools Substack account
const UA = { 'User-Agent': 'Mozilla/5.0 (StackTools admin)' };
const MAX_ITEMS = 40;

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: UA, next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function toReply(c, answered, source, fallbackUrl) {
  return {
    id: c.id,
    name: c.name || 'Someone',
    handle: c.handle || null,
    photo: c.photo_url || null,
    body: c.body || '',
    date: c.date,
    likes: c.reaction_count || 0,
    answered,
    url: fallbackUrl(c),
    on: { id: source.id, title: source.title, kind: source.kind, link: source.link },
  };
}

// A Note's replies: each branch is a direct reply plus its thread underneath.
async function noteReplies(item, noteId) {
  const d = await getJson(`https://substack.com/api/v1/reader/comment/${noteId}/replies`);
  if (!d?.commentBranches) return [];
  const out = [];
  for (const b of d.commentBranches) {
    const c = b.comment;
    if (!c || c.user_id === OUR_USER_ID) continue;
    const thread = (b.descendantComments || []).map((x) => x.comment || x).filter(Boolean);
    const answered = thread.some((x) => x.user_id === OUR_USER_ID);
    out.push(
      toReply(c, answered, item, (r) => `https://substack.com/profile/${r.user_id}/note/c-${r.id}`)
    );
  }
  return out;
}

// A post's comments (top level), with our replies nested as children.
async function postReplies(item, base, slug) {
  const post = await getJson(`${base}/api/v1/posts/${slug}`);
  if (!post?.id) return [];
  const d = await getJson(`${base}/api/v1/post/${post.id}/comments?all_comments=true&sort=newest_first`);
  if (!d?.comments) return [];
  return d.comments
    .filter((c) => c.user_id !== OUR_USER_ID)
    .map((c) =>
      toReply(
        c,
        (c.children || []).some((x) => x.user_id === OUR_USER_ID),
        item,
        (r) => `${base}/p/${slug}/comment/${r.id}`
      )
    );
}

function repliesFor(item) {
  const link = item.link || '';
  const note = link.match(/\/c-(\d+)/);
  if (note) return noteReplies(item, note[1]);
  const post = link.match(/^(https:\/\/[a-z0-9-]+\.substack\.com)\/p\/([^/?#]+)/i);
  if (post) return postReplies(item, post[1], post[2]);
  return Promise.resolve([]);
}

export async function GET(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  if (!(await getAdminUser(token))) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: items, error } = await admin
    .from('content_calendar')
    .select('id, title, kind, link, posted_at')
    .eq('status', 'live')
    .in('kind', ['note', 'reply', 'post'])
    .not('link', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(MAX_ITEMS);
  if (error) {
    return Response.json({ error: 'Could not read the calendar.' }, { status: 500 });
  }

  // A few at a time so we don't hammer Substack.
  const replies = [];
  for (let i = 0; i < items.length; i += 5) {
    const batch = await Promise.all(items.slice(i, i + 5).map(repliesFor));
    batch.forEach((r) => replies.push(...r));
  }
  const seen = new Set();
  const unique = replies.filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
  unique.sort((a, b) => new Date(b.date) - new Date(a.date));

  return Response.json({ replies: unique, checked: items.length });
}
