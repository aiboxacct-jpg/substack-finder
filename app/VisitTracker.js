'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getVisitorId, isAdminBrowser } from '@/lib/visitor';

// Sends one tiny beacon per page view to /api/track so we can count visits by
// utm_campaign ourselves (Vercel only splits by campaign on a paid add-on).
// Fire-and-forget: anything that goes wrong here is swallowed, never shown.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

function send(payload) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      // text/plain keeps it a "simple" request (no preflight).
      if (navigator.sendBeacon('/api/track', new Blob([body], { type: 'text/plain' }))) return;
    }
  } catch {
    /* fall back to fetch */
  }
  try {
    fetch('/api/track', {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'Content-Type': 'text/plain' },
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export default function VisitTracker() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    try {
      const loc = window.location;
      if (loc.pathname.startsWith('/admin') || loc.pathname.startsWith('/api')) return;

      const params = new URLSearchParams(loc.search);
      const payload = { path: loc.pathname };
      for (const k of UTM_KEYS) {
        const v = params.get(k);
        if (v) payload[k] = v;
      }

      // Only the first view of a page load has a meaningful referrer; later
      // client-side navigations would just repeat it. Same-host referrers are
      // internal clicks, not a source.
      if (first.current && document.referrer) {
        try {
          const ref = new URL(document.referrer).hostname.toLowerCase();
          if (ref && ref !== loc.hostname.toLowerCase()) payload.referrer_host = ref;
        } catch {
          /* bad referrer — ignore */
        }
      }
      first.current = false;

      payload.visitor_id = getVisitorId();
      if (isAdminBrowser()) payload.is_admin = true;
      send(payload);
    } catch {
      /* never let tracking break a page */
    }
  }, [pathname]);

  return null;
}
