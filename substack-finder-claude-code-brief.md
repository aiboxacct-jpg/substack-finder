# Build & Deploy: Substack Finder

I want to turn a prototype into a live website. Please scaffold this project, then guide me step by step (I'm not very technical, so explain each command before I run it).

## What it does
A web app where a visitor types a topic and gets back 6 real Substack newsletters on that topic — each shown as a card with the newsletter name, author, a one-line description, and a clickable link. It finds them by calling the Anthropic API with the web_search tool enabled.

## Stack
- **Next.js** (App Router) + React + Tailwind CSS
- Deploy target: **Vercel** (free tier)
- The Anthropic API key must live ONLY on the server as an environment variable (`ANTHROPIC_API_KEY`). Never expose it in client-side code.

## Architecture
1. **Frontend** (`app/page.js`): the UI below. On search it calls our OWN backend route `/api/search` (POST, JSON body `{ "topic": "..." }`) — it must NOT call api.anthropic.com directly.
2. **Backend** (`app/api/search/route.js`): a server route that reads `process.env.ANTHROPIC_API_KEY`, calls the Anthropic Messages API (`model: "claude-sonnet-4-6"`) with the `web_search_20250305` tool, and returns the parsed JSON array of results to the frontend. Keep the same prompt and JSON-parsing logic from the prototype (extract text blocks, strip ```` ``` ```` fences, slice from first `[` to last `]`, JSON.parse). Handle errors gracefully and return a clean error message.
3. **Rate limiting** (build from the start): cap searches per visitor (e.g. by IP) so a public visitor can't run up my API bill — for example ~10 searches per IP per hour, returning a clear "try again later" message when exceeded. Use a simple approach suitable for Vercel (an in-memory limiter is fine to start; mention a more durable option like Upstash Redis if I want it persistent across server instances).

## The prompt to send Claude (used inside the backend route)
> Use web search to find real, currently-active Substack newsletters about: "{TOPIC}". Try queries like "{TOPIC} site:substack.com" and "best {TOPIC} substack newsletters" and return the 6 most relevant. Respond with ONLY a raw JSON array (no markdown, no backticks). Each object: "name", "author" (use "" if unknown), "url" (real Substack URL, do not invent), "description" (one sentence, max ~18 words). Only include newsletters found via search.

## Frontend UI to port (from the working prototype)
Recreate this look and behavior: a centered card layout on a light orange→white gradient; a search input with a search-icon button; a row of "starter topic" pill buttons; a loading spinner state; an error banner; and result cards (hover lifts/highlights orange, external-link icon, author with a small user icon). Starter topics: Anime, Retail arbitrage, Reselling on eBay, Personal finance, AI & tech, Fragrance. Use lucide-react icons. Do NOT use browser localStorage.

## Steps I'd like you to walk me through
1. Create the Next.js project and install dependencies.
2. Build the frontend page and the `/api/search` backend route.
3. Run it locally so I can test it (`npm run dev`), using a `.env.local` file for my API key.
4. Push it to a GitHub repo.
5. Deploy to Vercel and set the `ANTHROPIC_API_KEY` secret in the Vercel dashboard.
6. Confirm the live URL works.

## Reminders for me (the human)
- I need an Anthropic API key from console.anthropic.com (separate pay-as-you-go account).
- Each search costs a small amount (model tokens + web search tool usage).
- Rate limiting is included from the start (see Architecture step 3) to protect my bill on a public site.
