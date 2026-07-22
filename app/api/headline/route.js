import Anthropic from '@anthropic-ai/sdk';
import {
  checkDailyCap,
  checkFreeLimit,
  formatWait,
  hashIdentity,
  FREE_LIMITS,
} from '@/lib/rateLimit';
import { getMembership, logToolRun, recordOutcome } from '@/lib/membership';
import { buildPrompt, parseJsonObject, normalize } from '@/lib/headline';

// Same 24h in-memory cache idea as the Finder: re-analysing an identical
// headline costs nothing and returns instantly. Per-server-instance, resets on
// restart — fine as a speed-up, not a guarantee.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const headlineCache = new Map(); // "headline|context" -> { data, expires }

// Guard rails on the input. This tool analyses a HEADLINE, not an article —
// a low cap keeps prompts (and therefore cost) tiny and predictable.
const MAX_HEADLINE_LENGTH = 200;
const MAX_CONTEXT_LENGTH = 300;

export async function POST(request) {
  // Declared out here so the catch block can mark a crashed run as an error.
  let logId = null;
  try {
    const ip =
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const token = (request.headers.get('authorization') || '').replace('Bearer ', '');

    const body = await request.json();
    const headline = (body?.headline || '').trim();
    const context = (body?.context || '').trim().slice(0, MAX_CONTEXT_LENGTH);

    if (!headline) {
      return Response.json({ error: 'Please enter a headline.' }, { status: 400 });
    }
    if (headline.length > MAX_HEADLINE_LENGTH) {
      return Response.json(
        {
          error: `That's longer than a headline (${headline.length} characters). Please paste just the title, up to ${MAX_HEADLINE_LENGTH} characters.`,
        },
        { status: 400 }
      );
    }

    // Members are unlimited; free/anonymous users get a few analyses a day.
    const { user, isMember } = await getMembership(token);
    if (!isMember) {
      const tier = user ? 'free' : 'anonymous';
      const identity = user?.id || hashIdentity(ip);
      const free = await checkFreeLimit(identity, 'headline', tier);
      if (!free.allowed) {
        const wait = formatWait(free.retryAfterMinutes);
        return Response.json(
          {
            error: user
              ? `You've used your ${free.limit} free analyses. More unlock in ${wait} — or upgrade to a Stack Tools membership for unlimited analyses across every tool.`
              : `You've used your ${free.limit} free analyses. Sign up free to get ${FREE_LIMITS.free} at a time, or upgrade for unlimited. More unlock in ${wait} either way.`,
            signup: !user,
            upgrade: !!user,
          },
          { status: 429 }
        );
      }
      // Site-wide backstop so the free tier can't spike the bill.
      const daily = checkDailyCap('headline');
      if (!daily.allowed) {
        return Response.json(
          {
            error:
              'This tool has hit its daily free limit. Please check back tomorrow — or upgrade for unlimited analyses.',
            upgrade: true,
          },
          { status: 429 }
        );
      }
    }

    // Log the run so the admin dashboard shows what people are analysing. The
    // outcome is filled in below once we know how it went.
    logId = await logToolRun(headline, user?.email, 'headline');

    const cacheKey = `${headline.toLowerCase()}|${context.toLowerCase()}`;
    const cached = headlineCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      await recordOutcome(logId, 'cached', cached.data.rewrites.length);
      return Response.json({ ...cached.data, cached: true });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'The server is missing its API key. Please contact the site owner.' },
        { status: 500 }
      );
    }

    // No web search here — this is pure judgement about the words themselves,
    // which is why an analysis costs a fraction of a cent instead of ~7¢.
    const prompt = buildPrompt(headline, context);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      // Haiku 4.5 with no tools — a full analysis is well under a cent.
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const raw = parseJsonObject(text);
    if (!raw) {
      await recordOutcome(logId, 'failed', 0);
      return Response.json(
        { error: 'Could not read the analysis. Please try again.' },
        { status: 200 }
      );
    }

    const data = normalize(raw, headline);

    // Only cache a result that actually came out usable.
    if (data.rewrites.length > 0) {
      headlineCache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });
    }

    await recordOutcome(
      logId,
      data.rewrites.length > 0 ? 'ok' : 'failed',
      data.rewrites.length
    );

    return Response.json(data);
  } catch (err) {
    console.error('Headline error:', err);
    await recordOutcome(logId, 'error');

    const status = err?.status;
    const apiMessage = err?.error?.error?.message || err?.message || '';
    let message = 'Something went wrong while analysing. Please try again.';

    if (status === 401) {
      message = 'The API key is missing or invalid. Please check the server configuration.';
    } else if (/credit balance/i.test(apiMessage)) {
      message =
        'The analyser is temporarily unavailable right now. Please try again in a little while.';
    } else if (status === 429) {
      message = 'The analyser is busy right now. Please try again in a moment.';
    }

    return Response.json({ error: message }, { status: status || 500 });
  }
}
