// Simple in-memory rate limiting to protect the API bill on a public site.
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

// ---- Layer 3: free-tier daily limit (members are unlimited) ----
// Free / anonymous users get a small taste; paying members skip this entirely.
// The allowance is PER TOOL, so using up your Finder matches doesn't also lock
// you out of the Headline Analyzer.
const FREE_DAILY_LIMIT = 3; // fresh runs per day, per tool, for a free/anon user

const freeHits = new Map(); // "tool:identity" -> { day, count }

export function checkFreeDailyLimit(identity, tool = 'finder') {
  const today = todayKey();
  const key = `${tool}:${identity}`;
  const rec = freeHits.get(key);
  if (!rec || rec.day !== today) {
    freeHits.set(key, { day: today, count: 1 });
    return { allowed: true, remaining: FREE_DAILY_LIMIT - 1 };
  }
  if (rec.count >= FREE_DAILY_LIMIT) {
    return { allowed: false };
  }
  rec.count += 1;
  return { allowed: true, remaining: FREE_DAILY_LIMIT - rec.count };
}

