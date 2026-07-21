'use client';

import { useState, useEffect } from 'react';

// Where should a "back to all tools" link point?
//
// On a per-tool subdomain (headline.stacktools.site) the middleware rewrites
// "/" straight back to that tool, so a plain href="/" would reload the same
// page instead of going to the hub. Those hosts need an absolute URL to the
// apex. Everywhere else (localhost, previews, the hub itself) "/" is correct.
//
// Starts at "/" and only upgrades after mount, so the server and client render
// the same markup and React never reports a hydration mismatch.
export function useHubHref() {
  const [href, setHref] = useState('/');

  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('.stacktools.site') && host !== 'www.stacktools.site') {
      setHref('https://stacktools.site');
    }
  }, []);

  return href;
}
