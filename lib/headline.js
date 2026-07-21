// Pure helpers for the Headline Analyzer: building the prompt, and turning the
// model's reply into the exact shape the UI renders. Kept out of the route so
// they can be tested without an API key or a running server.

// The four things that actually make a Substack headline work. Defined once so
// the prompt and the UI can never drift apart.
export const AXES = ['Clarity', 'Curiosity', 'Specificity', 'Length'];

export function buildPrompt(headline, context) {
  return `You are an expert Substack editor who has studied what makes newsletter headlines get opened and shared. Analyse this headline:

HEADLINE: "${headline}"${context ? `\nWHAT THE POST IS ABOUT: "${context}"` : ''}

Score it honestly — most real headlines land between 40 and 75, so do not inflate. Judge it as a Substack post title (an email subject line and a web headline at once), not as a news headline or clickbait.

Then write 5 alternative headlines. Each must cover the SAME topic and stay honest to it (never promise something the post would not deliver), but take a clearly DIFFERENT angle from the others, and each should be stronger than the original.

Output ONLY a raw JSON object and nothing else — no preamble, no explanation, no markdown, no code fences. Use exactly this shape:
{
  "score": <integer 0-100, the overall headline strength>,
  "verdict": "<one honest sentence, max 20 words, on the headline's single biggest problem or strength>",
  "breakdown": [
    {"label": "Clarity", "score": <integer 0-10>, "note": "<max 12 words: can a stranger tell what this is about?>"},
    {"label": "Curiosity", "score": <integer 0-10>, "note": "<max 12 words: does it create a reason to open?>"},
    {"label": "Specificity", "score": <integer 0-10>, "note": "<max 12 words: concrete details vs vague abstractions?>"},
    {"label": "Length", "score": <integer 0-10>, "note": "<max 12 words: does it survive an email inbox preview?>"}
  ],
  "rewrites": [
    {"headline": "<the rewritten headline>", "angle": "<1-3 words naming the angle, e.g. \\"Curiosity gap\\" or \\"Contrarian\\">"}
  ]
}
The "rewrites" array must contain exactly 5 objects.`;
}

// Pull the JSON object out of the model's reply, tolerating stray prose or code
// fences even though the prompt forbids both.
export function parseJsonObject(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Force the model's output into the exact shape the UI renders, so a sloppy
// response degrades gracefully instead of crashing the page. Always returns all
// four axes in a fixed order, scores clamped to range, and at most 5 rewrites
// with the original filtered out.
export function normalize(raw, headline) {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

  const breakdown = AXES.map((label) => {
    const found = Array.isArray(raw?.breakdown)
      ? raw.breakdown.find(
          (b) => String(b?.label || '').toLowerCase() === label.toLowerCase()
        )
      : null;
    return {
      label,
      score: clamp(found?.score, 0, 10),
      note: typeof found?.note === 'string' ? found.note.trim() : '',
    };
  });

  const rewrites = (Array.isArray(raw?.rewrites) ? raw.rewrites : [])
    .map((r) => ({
      headline: typeof r?.headline === 'string' ? r.headline.trim() : '',
      angle: typeof r?.angle === 'string' ? r.angle.trim() : '',
    }))
    .filter(
      (r) =>
        r.headline &&
        r.headline.toLowerCase() !== String(headline || '').trim().toLowerCase()
    )
    .slice(0, 5);

  return {
    score: clamp(raw?.score, 0, 100),
    verdict: typeof raw?.verdict === 'string' ? raw.verdict.trim() : '',
    breakdown,
    rewrites,
  };
}
