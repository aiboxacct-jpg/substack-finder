import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimit, checkDailyCap } from '@/lib/rateLimit';

// This runs ONLY on the server, so the API key is never sent to the browser.
export async function POST(request) {
  try {
    // 1. Rate limit by visitor IP so a public visitor can't run up the bill.
    const ip =
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown';
    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
      return Response.json(
        {
          error: `You've reached the search limit. Please try again in about ${minutes} minute${
            minutes === 1 ? '' : 's'
          }.`,
        },
        { status: 429 }
      );
    }

    // 2. Read and validate the topic from the request body.
    const { topic } = await request.json();
    if (!topic || !topic.trim()) {
      return Response.json({ error: 'Please enter a topic.' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'The server is missing its API key. Please contact the site owner.' },
        { status: 500 }
      );
    }

    // 3. Site-wide daily cap: a safety net so total searches can't spike the bill.
    const daily = checkDailyCap();
    if (!daily.allowed) {
      return Response.json(
        {
          error:
            'This site has reached its daily search limit. Please check back tomorrow.',
        },
        { status: 429 }
      );
    }

    // 4. The prompt sent to Claude (kept from the prototype).
    const prompt = `Use web search to find real, currently-active Substack newsletters about: "${topic}". Use at most 2 web searches (e.g. "${topic} site:substack.com" and "best ${topic} substack newsletters"), then return the 6 most relevant. Respond with ONLY a raw JSON array (no markdown, no backticks). Each object: "name", "author" (use "" if unknown), "url" (real Substack URL, do not invent), "description" (one sentence, max ~18 words), "tag" (1-3 word category or vibe, e.g. "beginner-friendly", "deep dives", "weekly"). Only include newsletters found via search.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const requestParams = {
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
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

    // 4. Extract the text blocks, strip code fences, slice to the JSON array.
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
        'Searches are temporarily unavailable (the account needs more credit). Please try again later.';
    } else if (status === 429) {
      message = 'The search service is busy right now. Please try again in a moment.';
    }

    return Response.json({ error: message }, { status: status || 500 });
  }
}
