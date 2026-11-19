import { createClient } from '@supabase/supabase-js';

// Public page-view beacon for our own campaign stats (see visits-table.sql).
//
// Deliberately forgiving: it ALWAYS answers 204, even for junk, so a bad
// request can never surface as an error on a page. Rows are written with the
// service key because the visits table has RLS on and no policies.
//
// Stored: path, host, utm_*, referrer host, a random visitor id, admin flag.
// Not stored: IP, user agent, email, account id.

const MAX_BODY = 4096;
const CAPS = {
  path: 300,
  utm_source: 100,
  utm_medium: 100,
  utm_campaign: 150,
  utm_content: 150,
  utm_term: 150,
  referrer_host: 255,
  visitor_id: 64,
};

// Crawlers, link unfurlers, uptime checkers and headless browsers.
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|whatsapp\/|vercel-|lighthouse|pingdom|uptime|headless|phantom|puppeteer|playwright|curl\/|wget|python|axios|node-fetch|go-http|java\/|httpclient|okhttp/i;

// Light per-visitor (and per-connection) rate limit, in memory. It only has
// to stop one tab or script flooding the table, so per-instance is fine.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map();

function limited(key) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, ts] of hits) if (!ts.length || now - ts[ts.length - 1] > WINDOW_MS) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

function clean(value, max) {
  if (typeof value !== 'string') return null;
  // Drop control characters, trim, cap.
  const v = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return v || null;
}

const done = () => new Response(null, { status: 204 });

export async function POST(request) {
  try {
    const ua = request.headers.get('user-agent') || '';
    if (!ua || BOT_UA.test(ua)) return done();

    const text = await request.text();
    if (!text || text.length > MAX_BODY) return done();

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return done();
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return done();

    const row = {};
    for (const [k, max] of Object.entries(CAPS)) row[k] = clean(body[k], max);

    if (!row.path || !row.path.startsWith('/')) return done();
    const p = row.path.toLowerCase();
    if (p.startsWith('/admin') || p.startsWith('/api') || p.startsWith('/_next')) return done();

    // Campaign tags are compared case-insensitively in practice; store lowercase
    // so "Round-Two" and "round-two" land in one bucket.
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
      if (row[k]) row[k] = row[k].toLowerCase();
    }
    if (row.referrer_host) {
      row.referrer_host = row.referrer_host.toLowerCase();
      if (!/^[a-z0-9.-]+$/.test(row.referrer_host)) row.referrer_host = null;
    }
    if (row.visitor_id && !/^[A-Za-z0-9-]+$/.test(row.visitor_id)) row.visitor_id = null;

    // Host comes from the request, not the client, and is capped too.
    row.host = clean((request.headers.get('host') || '').split(':')[0].toLowerCase(), 255);
    row.is_admin = body.is_admin === true;

    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    if (limited(`v:${row.visitor_id || 'none'}`) || (ip && limited(`ip:${ip}`))) return done();

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return done();
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await admin.from('visits').insert(row);
    if (error) console.error('track insert error:', error.message);
  } catch (e) {
    console.error('track error:', e?.message);
  }
  return done();
}
