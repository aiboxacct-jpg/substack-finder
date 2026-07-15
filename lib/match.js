import Anthropic from '@anthropic-ai/sdk';

// Shared collaboration-match logic, used by the weekly email digest cron.
// (The live search route keeps its own copy inline; if you change the prompt in
// app/api/search/route.js, mirror it here so emailed matches stay consistent.)

// For each newsletter, fetch its Substack RSS (…/feed) to attach latest posts.
export async function enrichWithLatestPosts(results) {
  await Promise.all(
    results.map(async (r) => {
      r.latestPosts = [];
      r.lastPostAt = null;
      let feedUrl;
      try {
        feedUrl = new URL(r.url).origin + '/feed';
      } catch {
        return;
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(feedUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'SubstackFinder/1.0 (+substackfinder.site)' },
        });
        clearTimeout(timer);
        if (!res.ok) return;
        const xml = await res.text();
        const items = xml.split('<item>').slice(1, 4);
        const posts = [];
        for (const item of items) {
          const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
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
        // feed unavailable — leave empty
      }
    })
  );
  return results;
}

// Given a writer's own Substack, return 6 collaboration matches (with % match
// scores, absolute URLs, and latest posts). Returns [] on any failure.
export async function getMatches(topic) {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const prompt = `You are helping a Substack writer find collaboration and cross-promotion partners. The writer's own Substack is: "${topic}". Use web search to identify what it is about (its niche, topic, and audience), then find 6 OTHER real, currently-active Substack newsletters in the same or an adjacent niche with a comparable audience — strong potential collaborators. Never include the writer's own Substack.

Output ONLY a raw JSON array of exactly 6 objects and nothing else — no preamble, no explanation, no markdown, no code fences. Each object must have: "name", "author" (or "" if unknown), "url" (the real Substack URL — do not invent), "description" (one sentence on why they'd be a good collaboration match, max ~20 words), "tag" (1-3 word overlap like "same niche" or "adjacent audience"), "match" (an integer from 70 to 98 = how strong a collaboration fit this is, where higher means a better match). Order the array from highest "match" to lowest. If you are unsure of the exact niche, infer it from the name/URL and still return 6 relevant, real newsletters.`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const params = {
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: prompt }],
    };
    let response = await anthropic.messages.create(params);
    let guard = 0;
    while (response.stop_reason === 'pause_turn' && guard < 5) {
      params.messages.push({ role: 'assistant', content: response.content });
      response = await anthropic.messages.create(params);
      guard += 1;
    }
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    let results;
    try {
      results = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return [];
    }
    if (!Array.isArray(results)) return [];
    for (const r of results) {
      const u = typeof r?.url === 'string' ? r.url.trim() : '';
      if (u && !/^https?:\/\//i.test(u)) r.url = 'https://' + u;
    }
    await enrichWithLatestPosts(results);
    return results;
  } catch {
    return [];
  }
}
