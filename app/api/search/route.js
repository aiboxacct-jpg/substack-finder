import Anthropic from '@anthropic-ai/sdk';
import { checkDailyCap, checkFreeDailyLimit } from '@/lib/rateLimit';
import { createClient } from '@supabase/supabase-js';

// Simple in-memory cache: a topic's results are reused for 24 hours so repeat
// (and popular) searches return instantly and cost nothing. Like the rate
// limiter, this is per-server-instance and resets on restart — fine as a
// speed-up; use Upstash Redis if you later want it shared/durable.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const searchCache = new Map(); // normalized topic -> { results, expires }

// For each newsletter, fetch its Substack RSS feed (…/feed) to get the latest
// post titles + dates. Runs all feeds in parallel with a short timeout; any
// feed that fails just leaves that card without posts (never breaks a search).
async function enrichWithLatestPosts(results) {
  await Promise.all(
    results.map(async (r) => {
      r.latestPosts = [];
      r.lastPostAt = null;

      let feedUrl;
      try {
        feedUrl = new URL(r.url).origin + '/feed';
      } catch {
        return; // no valid URL
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(feedUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'SubstackFinder/1.0 (+substack-finder.vercel.app)' },
        });
        clearTimeout(timer);
        if (!res.ok) return;

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

// Figure out who's calling and whether they're a paying member.
async function getMembership(token) {
  if (!token) return { user: null, isMember: false };
  try {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const {
      data: { user },
    } = await anon.auth.getUser(token);
    if (!user) return { user: null, isMember: false };

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data } = await admin
      .from('profiles')
      .select('is_subscribed')
      .eq('id', user.id)
      .single();
    return { user, isMember: !!data?.is_subscribed };
  } catch {
    return { user: null, isMember: false };
  }
}

// This runs ONLY on the server, so the API key is never sent to the browser.
export async function POST(request) {
  try {
    const ip =
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown';
    const token = (request.headers.get('authorization') || '').replace('Bearer ', '');

    // Read and validate the topic from the request body.
    const { topic } = await request.json();
    if (!topic || !topic.trim()) {
      return Response.json({ error: 'Please enter a topic.' }, { status: 400 });
    }

    // Members get unlimited searches; free/anonymous users get a small taste.
    const { user, isMember } = await getMembership(token);
    if (!isMember) {
      const identity = user?.id || ip;
      const free = checkFreeDailyLimit(identity);
      if (!free.allowed) {
        return Response.json(
          {
            error: user
              ? "You've used your free searches for today. Upgrade to a Stack Tools membership for unlimited searches."
              : "You've reached today's free search limit. Sign up and upgrade for unlimited searches.",
            upgrade: true,
          },
          { status: 429 }
        );
      }
      // Site-wide backstop so the free tier can't spike the bill.
      const daily = checkDailyCap();
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

    // Serve from cache if we've searched this topic recently (instant, free).
    const cacheKey = topic.trim().toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return Response.json({ results: cached.results, cached: true });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'The server is missing its API key. Please contact the site owner.' },
        { status: 500 }
      );
    }

    // The prompt sent to Claude (kept from the prototype).
    const prompt = `Use web search to find real, currently-active Substack newsletters about: "${topic}". Try queries like "${topic} site:substack.com" and "best ${topic} substack newsletters" and return the 6 most relevant. Respond with ONLY a raw JSON array (no markdown, no backticks). Each object: "name", "author" (use "" if unknown), "url" (real Substack URL, do not invent), "description" (one sentence, max ~18 words), "tag" (1-3 word category or vibe, e.g. "beginner-friendly", "deep dives", "weekly"). Only include newsletters found via search.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const requestParams = {
      // Haiku 4.5 is ~3x cheaper than Sonnet ($1/$5 vs $3/$15 per M tokens).
      // Haiku doesn't support the newer web_search_20260209, so we use the
      // standard web_search_20250305 variant here.
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      messages: [{ role: 'user', content: prompt }],
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

    // 6. Extract the text blocks, strip code fences, slice to the JSON array.
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');

    if (start === -1 || end === -1) {
      return Response.json({ results: [] });
    }

    let results;
    try {
      results = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return Response.json(
        { error: 'Could not read the results. Please try again.' },
        { status: 200 }
      );
    }

    // Enrich with each newsletter's latest posts (from RSS), then cache only
    // real, non-empty results so a bad/empty run isn't remembered.
    if (Array.isArray(results) && results.length > 0) {
      await enrichWithLatestPosts(results);
      searchCache.set(cacheKey, {
        results,
        expires: Date.now() + CACHE_TTL_MS,
      });
    }

    return Response.json({ results });
  } catch (err) {
    console.error('Search error:', err);

    // Turn common API failures into clear, friendly messages.
    const status = err?.status;
    const apiMessage = err?.error?.error?.message || err?.message || '';
    let message = 'Something went wrong while searching. Please try again.';

    if (status === 401) {
      message = 'The API key is missing or invalid. Please check the server configuration.';
    } else if (/credit balance/i.test(apiMessage)) {
      message =
        'Searches are temporarily unavailable (it is being replenished). Please try again later, or tip now to keep the service up!';
    } else if (status === 429) {
      message = 'The search service is busy right now. Please try again in a moment.';
    }

    return Response.json({ error: message }, { status: status || 500 });
  }
}
