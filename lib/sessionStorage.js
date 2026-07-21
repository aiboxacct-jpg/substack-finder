// Where the Supabase session is kept.
//
// The suite promises "one login unlocks every tool", but localStorage is scoped
// to a single origin, so a login on finder.stacktools.site would not carry over
// to headline.stacktools.site. A cookie scoped to ".stacktools.site" (leading
// dot) IS shared by every subdomain, which is what makes one login work.
//
// This is deliberately NOT applied everywhere. A browser will refuse to set a
// ".stacktools.site" cookie while you are on substackfinder.site — that is a
// different root domain — so forcing cookies globally would break login there
// while it still serves the Finder directly. Hosts that cannot use the shared
// cookie keep localStorage, exactly as before.

const SHARED_ROOT = 'stacktools.site';
const COOKIE_DOMAIN = '.stacktools.site';

// A Supabase session (JWT + refresh token + the user object and its metadata)
// regularly runs past the ~4KB per-cookie limit, so the value is split across
// numbered cookies and stitched back together on read.
const CHUNK_SIZE = 3000;
const MAX_CHUNKS = 12;
const ONE_YEAR = 31536000;

// Should this host use the shared cookie? True on stacktools.site and any of
// its subdomains; false on substackfinder.site, localhost and Vercel previews.
export function usesSharedCookie(hostname) {
  const h = (hostname || '').toLowerCase();
  return h === SHARED_ROOT || h.endsWith(`.${SHARED_ROOT}`);
}

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) return part.slice(prefix.length);
  }
  return null;
}

function writeCookie(name, rawValue, maxAge) {
  // Secure is safe to always set here: this path only ever runs on
  // stacktools.site hosts, which are HTTPS-only.
  document.cookie =
    `${encodeURIComponent(name)}=${rawValue}; domain=${COOKIE_DOMAIN}; path=/; ` +
    `max-age=${maxAge}; SameSite=Lax; Secure`;
}

export function createCookieStorage() {
  return {
    getItem(key) {
      if (typeof document === 'undefined') return null;

      const parts = [];
      for (let i = 0; i < MAX_CHUNKS; i++) {
        const chunk = readCookie(`${key}.${i}`);
        if (chunk === null) break;
        parts.push(chunk);
      }

      if (parts.length === 0) {
        // First visit after this change: a session may still be sitting in
        // localStorage from before. Read it so nobody gets logged out — the
        // next write lands in cookies and the handover completes itself.
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      }

      try {
        return decodeURIComponent(parts.join(''));
      } catch {
        return null;
      }
    },

    setItem(key, value) {
      if (typeof document === 'undefined') return;

      const encoded = encodeURIComponent(value);
      const count = Math.max(1, Math.ceil(encoded.length / CHUNK_SIZE));

      for (let i = 0; i < count && i < MAX_CHUNKS; i++) {
        writeCookie(`${key}.${i}`, encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), ONE_YEAR);
      }
      // A shorter session than last time leaves stale trailing chunks behind,
      // which would corrupt the next read. Clear them.
      for (let i = count; i < MAX_CHUNKS; i++) {
        if (readCookie(`${key}.${i}`) !== null) writeCookie(`${key}.${i}`, '', 0);
      }

      // Drop any pre-cookie copy so the two can never disagree.
      try {
        window.localStorage.removeItem(key);
      } catch {}
    },

    removeItem(key) {
      if (typeof document === 'undefined') return;
      for (let i = 0; i < MAX_CHUNKS; i++) {
        if (readCookie(`${key}.${i}`) !== null) writeCookie(`${key}.${i}`, '', 0);
      }
      try {
        window.localStorage.removeItem(key);
      } catch {}
    },
  };
}
