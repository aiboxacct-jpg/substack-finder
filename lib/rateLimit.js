import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Rate limiting to protect the API bill on a public site.
//
// Two layers:
//   1. Per-visitor: each IP can run a limited number of searches per hour.
//   2. Site-wide:   a daily cap across ALL visitors as a safety net.
//
// NOTE: "in-memory" means these counters reset when the server restarts, and
// each Vercel server instance keeps its own counts (so with several instances
// the real-world caps are a bit higher than the numbers below). That's fine as
// a launch safeguard. For limits that are exact and shared across every
// instance, swap this for Upstash Redis (https://upstash.com) — a free option.

// ---- Layer 1: per-visitor hourly limit ----
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_SEARCHES = 10; // per IP, per hour

const hits = new Map(); // ip -> array of timestamps (ms)

export function checkRateLimit(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_SEARCHES) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  hits.set(ip, recent);
  return { allowed: true, remaining: MAX_SEARCHES - recent.length };
}

// ---- Layer 2: site-wide daily cap (PER TOOL) ----
// Total free runs per day across everyone, as a bill safeguard. Members are
// unlimited and never count against this.
//
// Each tool gets its OWN cap because they cost wildly different amounts to run.
// A shared pot would let a cheap tool starve an expensive one (or vice versa).
//   finder   — ~7¢ per match (Claude + live web search). 70/day ≈ $5/day.
//   headline — ~0.4¢ per analysis (Claude only, no web search). 500/day ≈ $2/day.
const DAILY_CAPS = {
  finder: 70,
  headline: 500,
};
const DEFAULT_DAILY_CAP = 70;

const daily = new Map(); // tool -> { day, count }

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" (UTC)
}

// Checks the site-wide cap for one tool and, if there's room, counts this run.
export function checkDailyCap(tool = 'finder') {
  const cap = DAILY_CAPS[tool] ?? DEFAULT_DAILY_CAP;
  const today = todayKey();
  let rec = daily.get(tool);

  if (!rec || rec.day !== today) {
    // New day (or first run for this tool) — start a fresh counter.
    rec = { day: today, count: 0 };
    daily.set(tool, rec);
  }

  if (rec.count >= cap) {
    return { allowed: false };
  }

  rec.count += 1;
  return { allowed: true, remaining: cap - rec.count };
}

// ---- Layer 3: free-tier limit (members are unlimited) ----
// Two free tiers, so signing up actually gets you something and there is a
// step between "no" and "pay me":
//   anonymous -> a real taste, then "sign up free for more"
//   free      -> more, then "upgrade for unlimited"
//   member    -> never reaches here
//
// A ROLLING 6-hour window rather than a calendar day. A daily cap locks someone
// out until midnight UTC after a few tries in one sitting, which is a harsh
// first impression. Six hours lets them come back the same day.
//
// The allowance is PER TOOL, so using up your Finder matches doesn't also lock
// you out of the Headline Analyzer.
export const FREE_LIMITS = {
  anonymous: 2,
  free: 5,
};
const FREE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

// Anonymous visitors are identified by a salted hash of their IP, never the IP
// itself, so the stored value is not directly personal data. IPs are
// low-entropy enough to brute force given the salt, so the salt must stay
// server-side — it is only ever read from the environment here.
export function hashIdentity(ip) {
  return createHash('sha256')
    .update(`${ip}|${process.env.RATE_LIMIT_SALT || 'stacktools-default-salt'}`)
    .digest('hex')
    .slice(0, 40);
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Durable check, backed by the rate_limits table so limits survive deploys and
// are shared across server instances. Falls back to the in-memory counter below
// if the database is unreachable: a database blip should slow abuse down, not
// take the whole site offline.
export async function checkFreeLimit(identity, tool = 'finder', tier = 'anonymous') {
  const limit = FREE_LIMITS[tier] ?? FREE_LIMITS.anonymous;
  const since = new Date(Date.now() - FREE_WINDOW_MS).toISOString();

  try {
    const supa = db();
    const { data, error } = await supa
      .from('rate_limits')
      .select('created_at')
      .eq('identity', identity)
      .eq('tool', tool)
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (data.length >= limit) {
      // When the oldest run leaves the window, a slot frees up. Report that so
      // the message can say when, rather than just refusing.
      const waitMs = FREE_WINDOW_MS - (Date.now() - new Date(data[0].created_at).getTime());
      return {
        allowed: false,
        limit,
        retryAfterMinutes: Math.max(1, Math.ceil(waitMs / 60000)),
      };
    }

    await supa.from('rate_limits').insert({ identity, tool });

    // Rows older than two windows can never affect a decision. Pruned on a
    // small fraction of requests so no cron is needed for it.
    if (Math.random() < 0.02) {
      await supa
        .from('rate_limits')
        .delete()
        .lt('created_at', new Date(Date.now() - 2 * FREE_WINDOW_MS).toISOString());
    }

    return { allowed: true, limit, remaining: limit - data.length - 1 };
  } catch {
    return memoryFallback(identity, tool, limit);
  }
}

// The old in-memory limiter, kept only as a fallback for when the database is
// unavailable. Per-instance and wiped on deploy, which is exactly why it is no
// longer the primary mechanism.
const freeHits = new Map(); // "tool:identity" -> array of timestamps (ms)

function memoryFallback(identity, tool, limit) {
  const now = Date.now();
  const key = `${tool}:${identity}`;
  const recent = (freeHits.get(key) || []).filter((t) => now - t < FREE_WINDOW_MS);

  if (recent.length >= limit) {
    const waitMs = FREE_WINDOW_MS - (now - recent[0]);
    return {
      allowed: false,
      limit,
      retryAfterMinutes: Math.max(1, Math.ceil(waitMs / 60000)),
    };
  }

  recent.push(now);
  freeHits.set(key, recent);

  if (freeHits.size > 5000) {
    for (const [k, times] of freeHits) {
      if (!times.some((t) => now - t < FREE_WINDOW_MS)) freeHits.delete(k);
    }
  }

  return { allowed: true, limit, remaining: limit - recent.length };
}

// Turn the wait into something a person can read.
export function formatWait(minutes) {
  if (!minutes || minutes < 60) return `about ${Math.max(1, minutes || 1)} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'about an hour' : `about ${hours} hours`;
}

