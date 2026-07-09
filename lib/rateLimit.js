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

// ---- Layer 2: site-wide daily cap ----
const DAILY_CAP = 100; // total searches per day, across everyone

let dailyCount = 0;
let dailyKey = todayKey();

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" (UTC)
}

// Checks the site-wide cap and, if there's room, counts this search.
export function checkDailyCap() {
  const today = todayKey();
  if (today !== dailyKey) {
    // New day — reset the counter.
    dailyKey = today;
    dailyCount = 0;
  }

  if (dailyCount >= DAILY_CAP) {
    return { allowed: false };
  }

  dailyCount += 1;
  return { allowed: true, remaining: DAILY_CAP - dailyCount };
}
