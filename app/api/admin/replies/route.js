import { createClient } from '@supabase/supabase-js';
import { getAdminUser } from '@/lib/membership';

// Replies inbox: pulls the replies people left on our live Notes and posts
// (from the content calendar) using Substack's public comment endpoints, so
// Matt doesn't have to go looking. Our own replies are filtered out, and each
// reply says whether we've already answered it.
//
// "Answered" = Stack Tools replied anywhere in that comment's thread. Substack
// only inlines part of a thread, so when a comment has more descendants than
// were returned we fetch its own replies (all pages) and keep looking.
// A manual mark in the reply_status table overrides the automatic check.
//
// POST   { comment_id, answered, reply_url }  -> save a manual mark
// DELETE { comment_id }                      -> clear it (back to auto)

export const maxDuration = 60;

const OUR_USER_ID = 523797109; // the Stack Tools Substack account
const UA = 'Mozilla/5.0 (StackTools admin)';
const MAX_ITEMS = 40;
const MAX_PAGES = 20; // per thread, so a bad cursor can't loop forever
const MAX_DEPTH = 3; // how far down a thread we'll fetch for our reply

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function gate(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  return getAdminUser(token);
}

async function getJson(url, init = {}) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, next: { revalidate: 300 }, ...init });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Substack's reply cursors are tied to the session that issued them: sent
// without that session's cookies, a cursor just returns page one again. So
// each thread gets its own little cookie jar, and pages aren't cached.
async function allBranches(commentId) {
  const jar = new Map();
  const branches = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `https://substack.com/api/v1/reader/comment/${commentId}/replies` +
      (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');
    let d = null;
    try {
      const headers = { 'User-Agent': UA };
      if (jar.size) headers.Cookie = [...jar.values()].join('; ');
      const res = await fetch(url, { headers, cache: 'no-store' });
      for (const c of res.headers.getSetCookie?.() || []) {
        const kv = c.split(';')[0];
        jar.set(kv.split('=')[0], kv);
      }
      if (res.ok) d = await res.json();
    } catch {
      d = null;
    }
    if (!d?.commentBranches) break;
    branches.push(...d.commentBranches);
    if (!(d.moreBranches > 0) || !d.nextCursor || d.nextCursor === cursor) break;
    cursor = d.nextCursor;
  }
  return branches;
}

const noteUrl = (c) => `https://substack.com/profile/${c.user_id}/note/c-${c.id}`;

// Look for our reply under one branch. Returns the URL of our reply, or null.
async function ourReplyIn(branch, depth = 0) {
  const c = branch.comment;
  const thread = (branch.descendantComments || []).map((x) => x.comment || x).filter(Boolean);
  const mine = thread.find((x) => x.user_id === OUR_USER_ID);
  if (mine) return noteUrl(mine);
  // Everything in the thread was inlined and none of it is ours.
  if ((c.descendants_count ?? c.children_count ?? 0) <= thread.length) return null;
  if (depth >= MAX_DEPTH) return null;
  for (const b of await allBranches(c.id)) {
    if (b.comment?.user_id === OUR_USER_ID) return noteUrl(b.comment);
    const deeper = await ourReplyIn(b, depth + 1);
    if (deeper) return deeper;
  }
  return null;
}

function toReply(c, ourReply, source, fallbackUrl) {
  return {
    id: String(c.id),
    name: c.name || 'Someone',
    handle: c.handle || null,
    photo: c.photo_url || null,
    body: c.body || '',
    date: c.date,
    likes: c.reaction_count || 0,
    autoAnswered: !!ourReply,
    answered: !!ourReply,
    replyUrl: ourReply || null,
    autoReplyUrl: ourReply || null,
    manual: null,
    url: fallbackUrl(c),
    on: { id: source.id, title: source.title, kind: source.kind, link: source.link },
  };
}

// A Note's replies: each branch is a direct reply plus its thread underneath.
// Reads every page, not just the first eight branches.
async function noteReplies(item, noteId) {
  const branches = await allBranches(noteId);
  const readers = branches.filter((b) => b.comment && b.comment.user_id !== OUR_USER_ID);
  const out = [];
  for (let i = 0; i < readers.length; i += 5) {
    const found = await Promise.all(readers.slice(i, i + 5).map((b) => ourReplyIn(b)));
    readers.slice(i, i + 5).forEach((b, j) => out.push(toReply(b.comment, found[j], item, noteUrl)));
  }
  return out;
}

// Our reply anywhere in a post comment's nested children.
function ourChild(children, base, slug) {
  for (const x of children || []) {
    if (x.user_id === OUR_USER_ID) return `${base}/p/${slug}/comment/${x.id}`;
    const deeper = ourChild(x.children, base, slug);
    if (deeper) return deeper;
  }
  return null;
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
      toReply(c, ourChild(c.children, base, slug), item, (r) => `${base}/p/${slug}/comment/${r.id}`)
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
  if (!(await gate(request))) return Response.json({ error: 'Not authorized' }, { status: 401 });

  const admin = db();
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

  // Manual marks win over auto-detection.
  let marksReady = true;
  if (unique.length) {
    const marks = await admin
      .from('reply_status')
      .select('comment_id, answered, reply_url, answered_at')
      .in('comment_id', unique.map((r) => r.id));
    if (marks.error) {
      marksReady = false;
    } else {
      const byId = new Map(marks.data.map((m) => [m.comment_id, m]));
      for (const r of unique) {
        const m = byId.get(r.id);
        if (!m) continue;
        r.manual = m;
        r.answered = m.answered;
        if (m.reply_url) r.replyUrl = m.reply_url;
        else if (!m.answered) r.replyUrl = null;
      }
    }
  }

  return Response.json({ replies: unique, checked: items.length, marksReady });
}

const isCommentId = (id) => typeof id === 'string' && /^\d{1,20}$/.test(id);

export async function POST(request) {
  if (!(await gate(request))) return Response.json({ error: 'Not authorized' }, { status: 401 });
  try {
    const body = await request.json();
    const id = String(body.comment_id ?? '');
    if (!isCommentId(id)) return Response.json({ error: 'Unknown reply.' }, { status: 400 });
    const answered = body.answered !== false;
    let url = typeof body.reply_url === 'string' ? body.reply_url.trim() : '';
    if (url && !/^https?:\/\//i.test(url)) {
      return Response.json({ error: 'Reply link must start with http.' }, { status: 400 });
    }
    if (url.length > 500) return Response.json({ error: 'Reply link is too long.' }, { status: 400 });
    const now = new Date().toISOString();
    const row = {
      comment_id: id,
      answered,
      reply_url: answered && url ? url : null,
      answered_at: answered ? now : null,
      updated_at: now,
    };
    const res = await db().from('reply_status').upsert(row).select('comment_id, answered, reply_url, answered_at').single();
    if (res.error) {
      return Response.json(
        { error: 'Could not save. Run reply-status-table.sql in Supabase if the table is missing.' },
        { status: 500 }
      );
    }
    return Response.json({ mark: res.data });
  } catch {
    return Response.json({ error: 'Could not save.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await gate(request))) return Response.json({ error: 'Not authorized' }, { status: 401 });
  try {
    const body = await request.json();
    const id = String(body.comment_id ?? '');
    if (!isCommentId(id)) return Response.json({ error: 'Unknown reply.' }, { status: 400 });
    const res = await db().from('reply_status').delete().eq('comment_id', id);
    if (res.error) return Response.json({ error: 'Could not clear.' }, { status: 500 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Could not clear.' }, { status: 500 });
  }
}
