'use client';

import { useState, useEffect } from 'react';

// Where things live, given that one app serves several hostnames.
//
// Within the app each tool is a route (/finder, /headline), but on
// stacktools.site each tool also has its own subdomain, and that subdomain is
// the canonical home. Linking to the bare route from a tool subdomain is wrong
// in two ways: "/" gets rewritten straight back to the current tool, and
// pointing at finder.stacktools.site/headline would duplicate every page under
// two URLs.

const SHARED_ROOT = 'stacktools.site';

const TOOL_ROUTES = {
  finder: '/finder',
  headline: '/headline',
};

function onSharedRoot(hostname) {
  const h = (hostname || '').toLowerCase();
  return h === SHARED_ROOT || h.endsWith(`.${SHARED_ROOT}`);
}

// Absolute URL for a tool on stacktools.site hosts, plain route everywhere else
// (localhost, Vercel previews). Safe to call from a click handler; on the server
// it falls back to the route.
export function toolUrl(tool, search = '') {
  const route = TOOL_ROUTES[tool] || '/';
  if (typeof window === 'undefined') return route + search;
  if (onSharedRoot(window.location.hostname)) {
    return `https://${tool}.${SHARED_ROOT}/${search}`;
  }
  return route + search;
}

// Same idea for rendered links. Starts at the plain route so server and client
// markup match, then upgrades after mount — no hydration mismatch.
export function useToolHref(tool) {
  const [href, setHref] = useState(TOOL_ROUTES[tool] || '/');
  useEffect(() => {
    setHref(toolUrl(tool));
  }, [tool]);
  return href;
}

// Where a "back to all tools" link should point. On a per-tool subdomain "/" is
// rewritten back to that tool, so the hub needs an absolute URL to the apex.
export function useHubHref() {
  const [href, setHref] = useState('/');
  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    if (onSharedRoot(host) && host !== SHARED_ROOT && host !== `www.${SHARED_ROOT}`) {
      setHref(`https://${SHARED_ROOT}`);
    }
  }, []);
  return href;
}
