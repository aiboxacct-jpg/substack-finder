import { createClient } from '@supabase/supabase-js';

// Very light in-memory anti-spam: cap submissions per IP per day. Per-instance
// and resets on restart (same tradeoff as the search limiter) — enough to stop
// a single source from flooding the queue. Real quality control is the admin
// approval step; nothing a visitor submits goes public without a click.
const SUBMIT_LIMIT_PER_DAY = 5;
const submitCounts = new Map(); // ip -> { day, count }

function withinSubmitLimit(ip) {
  const day = new Date().toISOString().slice(0, 10);
  const rec = submitCounts.get(ip);
  if (!rec || rec.day !== day) {
    submitCounts.set(ip, { day, count: 1 });
    return true;
  }
  if (rec.count >= SUBMIT_LIMIT_PER_DAY) return false;
  rec.count += 1;
  return true;
}

// Accept a creator-submitted newsletter. Saved as status 'pending' — it does
// NOT appear anywhere until the admin approves it on the /admin page.
export async function POST(request) {
  try {
    const ip =
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid submission.' }, { status: 400 });
    }

    // Clean + validate each field.
    const name = String(body.name || '').trim();
    let url = String(body.url || '').trim();
    const description = String(body.description || '').trim();
    const tags = String(body.tags || '')
      .trim()
      .toLowerCase()
      .slice(0, 120);

    if (name.length < 2 || name.length > 100) {
      return Response.json(
        { error: 'Please enter a newsletter name (2–100 characters).' },
        { status: 400 }
      );
    }
    if (description.length < 5 || description.length > 400) {
      return Response.json(
        { error: 'Please add a short description (5–400 characters).' },
        { status: 400 }
      );
    }

    // Accept a bare domain (e.g. "myletter.substack.com") by adding https://.
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    let validUrl = false;
    try {
      const u = new URL(url);
      validUrl = u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      validUrl = false;
    }
    if (!validUrl) {
      return Response.json(
        { error: 'Please enter a valid link (e.g. https://yourname.substack.com).' },
        { status: 400 }
      );
    }

    if (!withinSubmitLimit(ip)) {
      return Response.json(
        { error: "You've submitted several already today — thanks! Please try again tomorrow." },
        { status: 429 }
      );
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { error } = await admin.from('submissions').insert({
      name,
      url,
      description,
      tags,
      status: 'pending',
    });

    if (error) {
      console.error('Submission insert error:', error.message);
      return Response.json(
        { error: 'Could not save your submission. Please try again.' },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Submit error:', err);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
