import { createClient } from '@supabase/supabase-js';

// Saves a snapshot of a result set and hands back an id for a shareable link.
// No AI call, so this is free to run and free to view.

const MAX_RESULTS = 12;
const MAX_TOPIC_LENGTH = 300;
const MAX_FIELD_LENGTH = 500;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Rebuild each card from known fields only. This endpoint is unauthenticated so
// that non-members can share too, which means it must never store whatever JSON
// it is handed — otherwise it becomes free file hosting. Anything not on this
// list is dropped.
function sanitize(results) {
  return results.slice(0, MAX_RESULTS).map((r) => {
    const card = {
      name: str(r?.name, MAX_FIELD_LENGTH),
      author: str(r?.author, MAX_FIELD_LENGTH),
      url: str(r?.url, MAX_FIELD_LENGTH),
      description: str(r?.description, MAX_FIELD_LENGTH),
      tag: str(r?.tag, 60),
    };
    const match = Number(r?.match);
    if (Number.isFinite(match)) card.match = Math.max(0, Math.min(100, Math.round(match)));

    // Keep the latest-post links, capped, since they are half the value of a card.
    if (Array.isArray(r?.latestPosts)) {
      card.latestPosts = r.latestPosts.slice(0, 2).map((p) => ({
        title: str(p?.title, MAX_FIELD_LENGTH),
        link: str(p?.link, MAX_FIELD_LENGTH),
        date: str(p?.date, 40),
      }));
    }
    return card;
  })
  // Only http(s) links get through, so a share link can never carry a
  // javascript: or data: URL to whoever opens it.
  .filter((c) => c.name && /^https?:\/\//i.test(c.url));
}

export async function POST(request) {
  try {
    const { topic, results } = await request.json();

    if (!topic || !Array.isArray(results) || results.length === 0) {
      return Response.json({ error: 'Nothing to share.' }, { status: 400 });
    }

    const cards = sanitize(results);
    if (cards.length === 0) {
      return Response.json({ error: 'Nothing to share.' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await admin
      .from('shared_results')
      .insert({ topic: str(topic, MAX_TOPIC_LENGTH), results: cards })
      .select('id')
      .single();

    if (error || !data?.id) {
      console.error('Share insert error:', error?.message);
      return Response.json(
        { error: 'Could not create the share link. Please try again.' },
        { status: 500 }
      );
    }

    return Response.json({ id: data.id });
  } catch (err) {
    console.error('Share error:', err);
    return Response.json(
      { error: 'Could not create the share link. Please try again.' },
      { status: 500 }
    );
  }
}
