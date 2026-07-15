import { createClient } from '@supabase/supabase-js';
import { getMatches } from '@/lib/match';

// Weekly "email me these" digest. Triggered by Vercel Cron (see vercel.json).
//
// SAFE BY DEFAULT: if RESEND_API_KEY isn't set, it returns immediately without
// doing any AI work or sending anything — so this stays dormant (and free)
// until the email feature is turned on. Also members must opt in per saved
// search (email_optin), and the member-facing toggle is still hidden behind a
// feature flag, so nobody is enrolled yet.

const WEEK_MS = 6 * 24 * 60 * 60 * 1000; // ~weekly guard against double-sends
const MAX_EMAILS_PER_RUN = 50; // safety cap while this is new

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDigestHtml(topic, matches) {
  const rows = matches
    .map((m) => {
      const pct = Number.isFinite(Number(m.match))
        ? `<span style="color:#16a34a;font-weight:600;font-size:12px;">${Math.round(
            Number(m.match)
          )}% match</span>`
        : '';
      const latest =
        m.latestPosts && m.latestPosts[0]
          ? `<div style="color:#888;font-size:12px;margin-top:4px;">Latest: ${escapeHtml(
              m.latestPosts[0].title
            )}</div>`
          : '';
      return `<tr><td style="padding:14px 0;border-bottom:1px solid #eee;">
        <div style="font-weight:600;color:#111;">${escapeHtml(m.name)} ${pct}</div>
        <div style="color:#555;font-size:14px;margin-top:2px;">${escapeHtml(m.description)}</div>
        ${latest}
        <a href="${escapeHtml(m.url)}" style="color:#ea580c;font-size:13px;text-decoration:none;">Visit &rarr;</a>
      </td></tr>`;
    })
    .join('');

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
    <h2 style="margin:0 0 6px;">Your collaboration matches this week</h2>
    <p style="color:#555;font-size:14px;margin:0 0 16px;">Based on your Substack (${escapeHtml(
      topic
    )}), here are creators worth connecting with:</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="color:#999;font-size:12px;margin-top:22px;">
      You're receiving this because you turned on "Email me these" for a saved search.
      Manage it anytime in your account at
      <a href="https://substackfinder.site" style="color:#ea580c;">substackfinder.site</a>.
    </p>
  </div>`;
}

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Substack Finder <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });
  return res.ok;
}

export async function GET(request) {
  // Only Vercel Cron (or someone with the secret) can trigger this.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Feature gate: dormant until email sending is configured.
  if (!process.env.RESEND_API_KEY) {
    return Response.json({ ok: true, skipped: 'email not configured yet', sent: 0 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: saved, error } = await admin
    .from('saved_searches')
    .select('id, user_id, topic, last_emailed_at')
    .eq('email_optin', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Digest query error:', error.message);
    return Response.json({ ok: false, error: 'query failed' }, { status: 500 });
  }
  if (!saved || saved.length === 0) return Response.json({ ok: true, sent: 0 });

  // Only paying members, one email per member per run.
  const userIds = [...new Set(saved.map((s) => s.user_id))];
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, is_subscribed')
    .in('id', userIds);
  const pmap = new Map((profiles || []).map((p) => [p.id, p]));

  const now = Date.now();
  const doneUsers = new Set();
  let sent = 0;

  for (const s of saved) {
    if (sent >= MAX_EMAILS_PER_RUN) break;
    if (doneUsers.has(s.user_id)) continue;
    const p = pmap.get(s.user_id);
    if (!p || !p.is_subscribed || !p.email) continue;
    if (s.last_emailed_at && now - Date.parse(s.last_emailed_at) < WEEK_MS) continue;

    doneUsers.add(s.user_id);
    const matches = await getMatches(s.topic);
    if (matches.length === 0) continue;

    const ok = await sendEmail(
      p.email,
      'Your weekly collaboration matches',
      buildDigestHtml(s.topic, matches)
    );
    if (ok) {
      await admin
        .from('saved_searches')
        .update({ last_emailed_at: new Date().toISOString() })
        .eq('id', s.id);
      sent += 1;
    }
  }

  return Response.json({ ok: true, sent });
}
