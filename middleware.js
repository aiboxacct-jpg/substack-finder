import { NextResponse } from 'next/server';

// One Next.js app serves every Stack Tools domain. Each tool lives at its own
// route (/finder, /headline), and this maps a hostname's ROOT onto that route.
//
// Why it matters: the Substack Finder used to live at "/". It now lives at
// "/finder", so without this rewrite substackfinder.site would show the hub
// instead of the tool — and that domain is the URL in the launch post.
//
// A rewrite (not a redirect) keeps the address bar showing the pretty domain.
const HOST_ROUTES = {
  // The Finder's original home — must keep working exactly as before.
  'substackfinder.site': '/finder',
  'www.substackfinder.site': '/finder',

  // Per-tool subdomains under the hub. These stay dormant until the domain
  // and its wildcard DNS record exist in Vercel + Namecheap.
  'finder.stacktools.site': '/finder',
  'headline.stacktools.site': '/headline',
};

export function middleware(request) {
  // Strip any port so localhost:3000 and previews behave predictably.
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const route = HOST_ROUTES[host];
  if (!route) return NextResponse.next(); // stacktools.site + previews → the hub

  const url = request.nextUrl;
  // Keep the query string so shared "?topic=..." links still auto-run.
  return NextResponse.rewrite(new URL(route + url.search, request.url));
}

// Only the bare root is ever rewritten. Everything else — /api/*, /admin,
// /terms, /privacy, static assets — is shared across all domains and passes
// through untouched, which keeps the Stripe webhook and cron paths stable.
export const config = {
  matcher: ['/'],
};
