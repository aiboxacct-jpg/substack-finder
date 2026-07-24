import Anthropic from '@anthropic-ai/sdk';
import {
  checkDailyCap,
  checkFreeLimit,
  formatWait,
  hashIdentity,
  FREE_LIMITS,
} from '@/lib/rateLimit';
import { getMembership, logToolRun, recordOutcome } from '@/lib/membership';
import { createClient } from '@supabase/supabase-js';

// How long Vercel lets this function run before killing it. Without this it
// falls back to Vercel's short default, so a slow AI run gets cut off mid-flight
// and the browser spins forever with no response (this is exactly what the
// Sonnet 5 experiment hit). 60s is the max on Hobby and safe on Pro; Haiku
// finishes in ~11s, so this is generous headroom. If a slower model is ever
// used here, raise this (Pro only) AND lower it below the client timeout below.
export const maxDuration = 60;

// If a single model call runs longer than this, the SDK throws instead of
// hanging — the catch block then returns a friendly "try again" message rather
// than the request outliving the function and leaving the user stuck. Kept
// under maxDuration on purpose so we fail cleanly before Vercel hard-kills us.
const ANTHROPIC_TIMEOUT_MS = 45000;

// Simple in-memory cache: a topic's results are reused for 24 hours so repeat
// (and popular) searches return instantly and cost nothing. Like the rate
// limiter, this is per-server-instance and resets on restart — fine as a
// speed-up; use Upstash Redis if you later want it shared/durable.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const searchCache = new Map(); // normalized topic -> { results, expires }

// For each newsletter, fetch its Substack RSS feed (…/feed) to get the latest
// post titles + dates. Runs all feeds in parallel with a short timeout; any
// feed that fails just leaves that card without posts (never breaks a search).
// Returns true ONLY when the homepage itself 404s. Used as a second opinion
// before discarding a match, so a publication with no working /feed survives.
async function homepageMissing(origin) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(origin, {
      signal: controller.signal,
      headers: { 'User-Agent': 'StackTools/1.0 (+stacktools.site)' },
    });
    clearTimeout(timer);
    return res.status === 404;
  } catch {
    return false; // unreachable is ambiguous, so keep the result
  }
}

async function enrichWithLatestPosts(results) {
  await Promise.all(
    results.map(async (r) => {
      r.latestPosts = [];
      r.lastPostAt = null;
      r.dead = false; // only set true when we positively confirm it does not exist

      let origin;
      try {
        origin = new URL(r.url).origin;
      } catch {
        r.dead = true; // unparseable URL is unusable either way
        return;
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(origin + '/feed', {
          signal: controller.signal,
          headers: { 'User-Agent': 'StackTools/1.0 (+stacktools.site)' },
        });
        clearTimeout(timer);
        if (!res.ok) {
          // A 404 feed usually means the model invented a near-miss subdomain
          // (e.g. "thepennydeadful" instead of "thepennydreadful"). Confirm
          // against the homepage before discarding.
          if (res.status === 404) r.dead = await homepageMissing(origin);
          return;
        }

        const xml = await res.text();
        const items = xml.split('<item>').slice(1, 4); // up to 3 most recent
        const posts = [];
        for (const item of items) {
          const titleMatch = item.match(
            /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/
          );
          const dateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
          const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
          const title = titleMatch ? titleMatch[1].trim() : '';
          const link = linkMatch ? linkMatch[1].trim() : null;
          let date = null;
          if (dateMatch) {
            const d = new Date(dateMatch[1].trim());
            if (!isNaN(d.getTime())) date = d.toISOString();
          }
          if (title) posts.push({ title, date, link });
        }
        r.latestPosts = posts;
        r.lastPostAt = posts.find((p) => p.date)?.date || null;
      } catch {
        // feed unavailable / timed out — leave this card's posts empty
      }
    })
  );
  return results;
}

// Fetch admin-approved, creator-submitted newsletters that match this topic.
// Matching is a simple case-insensitive word overlap against each submission's
// name/description/tags — cheap and predictable at small scale. Read fresh on
// every search (not cached) so a newly approved submission appears right away.
async function getMatchingSubmissions(topic) {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data } = await admin
      .from('submissions')
      .select('name, url, description, tags')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (!data || data.length === 0) return [];

    const words = topic
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3);
    if (words.length === 0) return [];

    return data
      .filter((s) => {
        const hay = `${s.name} ${s.description} ${s.tags || ''}`.toLowerCase();
        return words.some((w) => hay.includes(w));
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}

// This runs ONLY on the server, so the API key is never sent to the browser.
export async function POST(request) {
  // Declared out here so the catch block can mark a crashed run as an error.
  let logId = null;
  try {
    const ip =
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown';
    const token = (request.headers.get('authorization') || '').replace('Bearer ', '');

    // Read and validate the writer's own Substack (URL or name) from the body.
    const { topic } = await request.json();
    if (!topic || !topic.trim()) {
      return Response.json({ error: 'Please paste your Substack link.' }, { status: 400 });
    }

    // Members get unlimited searches; free/anonymous users get a small taste.
    const { user, isMember } = await getMembership(token);
    if (!isMember) {
      // Signing up moves you to a bigger allowance, so an anonymous visitor is
      // asked to register and a registered one is asked to upgrade. Anonymous
      // visitors are tracked by a salted hash of their IP, never the IP itself.
      const tier = user ? 'free' : 'anonymous';
      const identity = user?.id || hashIdentity(ip);
      const free = await checkFreeLimit(identity, 'finder', tier);
      if (!free.allowed) {
        // Say when they can come back. "You've hit the limit" with no timeframe
        // reads like a wall; naming the wait reads like a queue.
        const wait = formatWait(free.retryAfterMinutes);
        return Response.json(
          {
            error: user
              ? `You've used your ${free.limit} free matches. More unlock in ${wait} — or upgrade to a Stack Tools membership for unlimited matches across every tool.`
              : `You've used your ${free.limit} free matches. Sign up free to get ${FREE_LIMITS.free} at a time, or upgrade for unlimited. More unlock in ${wait} either way.`,
            signup: !user,
            upgrade: !!user,
          },
          { status: 429 }
        );
      }
      // Site-wide backstop so the free tier can't spike the bill.
      const daily = checkDailyCap('finder');
      if (!daily.allowed) {
        return Response.json(
          {
            error:
              'This site has hit its daily free-search limit. Please check back tomorrow — or upgrade for unlimited searches.',
            upgrade: true,
          },
          { status: 429 }
        );
      }
    }

    // Log this match so the admin dashboard can show who's matching what. The
    // outcome is filled in below once we know how it went.
    logId = await logToolRun(topic.trim(), user?.email, 'finder');

    // Creator submissions are read fresh (cheap) so approvals show immediately.
    const submissions = await getMatchingSubmissions(topic);

    // Serve from cache if we've searched this topic recently (instant, free).
    const cacheKey = topic.trim().toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      await recordOutcome(logId, 'cached', cached.results.length);
      return Response.json({ results: cached.results, submissions, cached: true });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'The server is missing its API key. Please contact the site owner.' },
        { status: 500 }
      );
    }

    // The prompt sent to Claude — the writer pastes their own Substack, and we
    // return other creators they could collaborate / cross-promote with.
    const prompt = `You are helping a Substack writer find collaboration and cross-promotion partners. The writer's own Substack is: "${topic}". Use web search to identify its niche, topic, and audience, then find 8 OTHER real, currently-active Substack newsletters in the same or an adjacent niche with a comparable audience — strong potential collaborators. Never include the writer's own Substack.

CRITICAL — how to respond:
- Respond with ONLY a raw JSON array of exactly 8 objects. Nothing else: no preamble, no explanation, no markdown, no code fences, no apology, and no note about uncertainty.
- NEVER reply in prose. Even if web search returns little about the writer's own newsletter, infer its niche from the name/URL and still return your 8 best real, relevant Substacks. A thin search is never a reason to explain yourself instead of answering — there is always a usable answer.
- Begin your reply with the character [ and end it with the character ].

Each object must have exactly these keys:
- "name": the newsletter's name
- "author": the author's name, or "" if unknown
- "url": the EXACT Substack URL as it appears in your search results. Never invent, guess, or "correct" a subdomain — a near-miss like "thepennydeadful" instead of "thepennydreadful" is a broken link. If you are not certain of the exact URL, pick a different newsletter you ARE certain about.
- "description": one sentence (max ~20 words) on why they'd be a good collaboration match
- "tag": a 1-3 word overlap, e.g. "same niche" or "adjacent audience"
- "match": an integer 70-98 for how strong a collaboration fit this is (higher = better)

Order the array from highest "match" to lowest. This is the exact shape to return — use real newsletters, NOT these placeholder values:
[{"name":"Example Newsletter","author":"Jane Doe","url":"https://example.substack.com","description":"Covers the same niche with a similarly engaged, comparable-sized audience.","tag":"same niche","match":92}]`;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: ANTHROPIC_TIMEOUT_MS,
    });

    // Ask the model once and pull a JSON array out of the reply. Returns null
    // if it answered in prose instead of data, which is the failure the retry
    // below exists to handle.
    async function attemptMatch(promptText) {
      const requestParams = {
        // REVERTED 2026-07-23 to Haiku 4.5 after the Sonnet 5 A/B made the
        // finder hang. Sonnet 5 + web_search_20260209 (dynamic filtering runs
        // server-side code execution) took 56-153s per run — with no route
        // maxDuration it outlived Vercel's timeout, so the tool spun forever.
        // Haiku 4.5 + the basic web_search_20250305 = ~11s, known-good.
        // To retry Sonnet safely next time: use the BASIC web_search_20250305
        // (skips the slow filtering step), add `export const maxDuration`, and
        // measure latency before pointing real traffic at it.
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: promptText }],
      };

      let response = await anthropic.messages.create(requestParams);

      // Web search runs server-side; if it needs another round it returns
      // stop_reason "pause_turn" — re-send to let it continue.
      let guard = 0;
      while (response.stop_reason === 'pause_turn' && guard < 5) {
        requestParams.messages.push({ role: 'assistant', content: response.content });
        response = await anthropic.messages.create(requestParams);
        guard += 1;
      }

      // Extract the text blocks, strip code fences, slice to the JSON array.
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start === -1 || end === -1) return null;

      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }

    // The model occasionally replies in prose ("I couldn't find enough about
    // this newsletter…") instead of JSON. That is random rather than a real
    // "no matches" — the first user to hit it was shown a message blaming her
    // link, which was fine. So try once more with a blunter instruction before
    // giving up. This only costs anything on the rare failure path; a
    // successful first call never reaches it.
    let results = await attemptMatch(prompt);
    let neededRetry = false;

    if (!Array.isArray(results) || results.length === 0) {
      neededRetry = true;
      results = await attemptMatch(
        `${prompt}\n\nIMPORTANT: a previous attempt failed by replying with prose instead of data. Reply with ONLY the JSON array. Do not explain, do not apologise, do not say you are unsure. If you cannot verify every detail, still return your 8 best real Substack newsletters based on what you do know.`
      );
    }

    // Both attempts came back unusable. Report it as a real failure rather than
    // quietly claiming there are no matches.
    if (!Array.isArray(results) || results.length === 0) {
      await recordOutcome(logId, 'failed', 0);
      return Response.json(
        {
          error:
            "The matcher had trouble reading that one. This is usually temporary — please try again in a moment.",
          submissions,
        },
        { status: 200 }
      );
    }

    // Tracking 'ok' vs 'ok_retry' separately shows how often the retry is
    // actually saving a run, which is the number that says whether the fix
    // was worth it.
    await recordOutcome(logId, neededRetry ? 'ok_retry' : 'ok', results.length);

    // The model sometimes returns bare domains (e.g. "foo.substack.com"); make
    // every URL absolute so card links work and RSS enrichment can parse them.
    if (Array.isArray(results)) {
      for (const r of results) {
        const u = typeof r?.url === 'string' ? r.url.trim() : '';
        if (u && !/^https?:\/\//i.test(u)) r.url = 'https://' + u;
      }
    }

    // Enrich with each newsletter's latest posts (from RSS), then cache only
    // real, non-empty results so a bad/empty run isn't remembered.
    if (Array.isArray(results) && results.length > 0) {
      await enrichWithLatestPosts(results);

      // Drop any match whose Substack does not actually exist. The model
      // sometimes invents a near-miss subdomain, and a reader clicking a dead
      // link is worse than showing one fewer card. We ask for 8 so that a full
      // 6 normally survive this filter.
      const alive = results.filter((r) => !r.dead);
      const deadCount = results.length - alive.length;

      // Also drop clearly-abandoned newsletters (no post within ~6 months).
      // Only when we actually have a last-post date; a match with no readable
      // feed is kept rather than wrongly dropped. Answers real launch feedback
      // that a match "hadn't posted since 2025" — bad for a collaboration tool.
      const STALE_MS = 183 * 24 * 60 * 60 * 1000; // ~6 months
      const now = Date.now();
      const fresh = alive.filter((r) => {
        if (!r.lastPostAt) return true; // no feed data — can't confirm, keep it
        const t = Date.parse(r.lastPostAt);
        return Number.isNaN(t) ? true : now - t <= STALE_MS;
      });
      const staleCount = alive.length - fresh.length;

      if (deadCount || staleCount) {
        console.warn(
          `"${topic}": dropped ${deadCount} dead + ${staleCount} stale match(es).`
        );
      }

      results = fresh.slice(0, 6);
      for (const r of results) delete r.dead;

      searchCache.set(cacheKey, {
        results,
        expires: Date.now() + CACHE_TTL_MS,
      });
    }

    return Response.json({ results, submissions });
  } catch (err) {
    console.error('Search error:', err);
    await recordOutcome(logId, 'error');

    // Turn common API failures into clear, friendly messages.
    const status = err?.status;
    const apiMessage = err?.error?.error?.message || err?.message || '';
    let message = 'Something went wrong while searching. Please try again.';

    if (status === 401) {
      message = 'The API key is missing or invalid. Please check the server configuration.';
    } else if (/credit balance/i.test(apiMessage)) {
      message =
        'Matches are temporarily unavailable right now. Please try again in a little while.';
    } else if (status === 429) {
      message = 'The search service is busy right now. Please try again in a moment.';
    }

    return Response.json({ error: message }, { status: status || 500 });
  }
}
