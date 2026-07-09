# Substack Finder

A small web app: type a topic, get back 6 real Substack newsletters on that
topic. It calls the Anthropic API (Claude) with web search enabled. The API key
lives only on the server; visitors are rate-limited (10 searches per IP per
hour) to protect the owner's bill.

## Tech
- Next.js (App Router) + React + Tailwind CSS
- Anthropic API: `claude-sonnet-4-6` with the `web_search` tool
- Deploy target: Vercel (free tier)

## Run it locally
1. Install dependencies: `npm install`
2. Put your Anthropic API key in `.env.local`:
   `ANTHROPIC_API_KEY=sk-ant-...`
3. Start the dev server: `npm run dev`
4. Open http://localhost:3000

## Deploy
- Push this folder to a GitHub repo.
- Import the repo at https://vercel.com.
- In Vercel project settings, add an Environment Variable named
  `ANTHROPIC_API_KEY` with your key, then deploy.

## Project layout
- `app/page.js` — the front-end UI (search box, pills, result cards)
- `app/api/search/route.js` — the back-end route that calls Claude
- `lib/rateLimit.js` — the per-IP rate limiter
