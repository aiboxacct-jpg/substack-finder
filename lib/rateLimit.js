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

// ---- Layer 3: free-tier limit (members are unlimited) ----
// Free / anonymous users get a small taste; paying members skip this entirely.
//
// A ROLLING 6-hour window rather than a calendar day. A daily cap means someone
// who tries a few times in one sitting is locked out until midnight UTC, which
// is a harsh first impression for a visitor still working out what the tool
// does. Six hours lets them come back the same day.
//
// Cost is still bounded: 3 per 6 hours is at most 12 runs/day per person, and
// the site-wide cap above remains the real ceiling on spend.
//
// The allowance is PER TOOL, so using up your Finder matches doesn't also lock
// you out of the Headline Analyzer.
const FREE_LIMIT = 3;
const FREE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

const freeHits = new Map(); // "tool:identity" -> array of timestamps (ms)

export function checkFreeLimit(identity, tool = 'finder') {
  const now = Date.now();
  const key = `${tool}:${identity}`;
  const recent = (freeHits.get(key) || []).filter((t) => now - t < FREE_WINDOW_MS);

  if (recent.length >= FREE_LIMIT) {
    // Tell the caller when the oldest run drops out of the window, so the
    // message can say when they can try again instead of just "no".
    const waitMs = FREE_WINDOW_MS - (now - recent[0]);
    return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil(waitMs / 60000)) };
  }

  recent.push(now);
  freeHits.set(key, recent);

  // One entry per visitor per tool would otherwise grow forever on a public
  // endpoint. Drop anything with no activity in the window when it gets big.
  if (freeHits.size > 5000) {
    for (const [k, times] of freeHits) {
      if (!times.some((t) => now - t < FREE_WINDOW_MS)) freeHits.delete(k);
    }
  }

  return { allowed: true, remaining: FREE_LIMIT - recent.length };
}

// Turn the wait into something a person can read.
export function formatWait(minutes) {
  if (!minutes || minutes < 60) return `about ${Math.max(1, minutes || 1)} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'about an hour' : `about ${hours} hours`;
}

