import { NextResponse } from 'next/server';

// One Next.js app serves every Stack Tools domain. This file decides, per
// hostname, what a request should actually see.

// Domains that are no longer the canonical home of a tool. They permanently
// redirect, preserving the path and query string, so links published before the
// move keep working forever.
//
// substackfinder.site is the URL printed in the launch post and in already-sent
// emails, which can never be edited. It must keep resolving for as long as that
// post exists, so the domain has to stay registered and on auto-renew. Sending
// its visitors to finder.stacktools.site is also what unifies login: every
// visitor then ends up on a .stacktools.site host and shares one session cookie.
const REDIRECT_HOSTS = {
  'substackfinder.site': 'https://finder.stacktools.site',
  'www.substackfinder.site': 'https://finder.stacktools.site',
};

// Hosts whose ROOT maps onto a tool's route. A rewrite (not a redirect) keeps
// the pretty domain in the address bar.
const HOST_ROUTES = {
  'finder.stacktools.site': '/finder',
  'headline.stacktools.site': '/headline',
};

export function middleware(request) {
  // Strip any port so localhost:3000 and previews behave predictably.
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const url = request.nextUrl;

  const redirectTo = REDIRECT_HOSTS[host];
  if (redirectTo) {
    // 308 keeps it permanent and preserves the method, and carrying the path
    // and query means shared "?topic=..." links still land on a live search.
    return NextResponse.redirect(new URL(url.pathname + url.search, redirectTo), 308);
  }

  const route = HOST_ROUTES[host];
  if (route && url.pathname === '/') {
    return NextResponse.rewrite(new URL(route + url.search, request.url));
  }

  // stacktools.site, previews and localhost fall through to the hub.
  return NextResponse.next();
}

// /api/* is deliberately excluded. Those paths are shared infrastructure — the
// Stripe webhook and the weekly digest cron among them — and a redirect would
// drop the Authorization header and silently break them. Static assets and
// Next internals are excluded for the same "never touch" reason.
export const config = {
  matcher: ['/((?!api|_next|favicon.ico).*)'],
};
