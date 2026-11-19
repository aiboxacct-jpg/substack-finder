import { usesSharedCookie } from './sessionStorage';

// Anonymous visitor id + "this browser is the admin" flag for our own visit
// tracking (see app/VisitTracker.js and /api/track).
//
// On stacktools.site hosts both live in a first-party cookie scoped to
// .stacktools.site, so www, finder. and headline. count one person once.
// Elsewhere (previews, localhost, substackfinder.site) they fall back to
// localStorage. The id is random — no IP, email or account is attached.

const VID = 'st_vid';
const ADMIN = 'st_admin';
const ONE_YEAR = 31536000;

function shared() {
  return typeof window !== 'undefined' && usesSharedCookie(window.location.hostname);
}

function readCookie(name) {
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(`${name}=`)) return decodeURIComponent(part.slice(name.length + 1));
  }
  return null;
}

function writeCookie(name, value, maxAge = ONE_YEAR) {
  document.cookie =
    `${name}=${encodeURIComponent(value)}; domain=.stacktools.site; path=/; ` +
    `max-age=${maxAge}; SameSite=Lax; Secure`;
}

function read(name) {
  try {
    return shared() ? readCookie(name) : window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name, value) {
  try {
    if (shared()) writeCookie(name, value);
    else window.localStorage.setItem(name, value);
  } catch {
    /* storage blocked — tracking just runs without a stable id */
  }
}

function randomId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getVisitorId() {
  let id = read(VID);
  if (!id) {
    id = randomId();
    write(VID, id);
  }
  return id;
}

export function isAdminBrowser() {
  return read(ADMIN) === '1';
}

// Called by the admin page once the admin login is confirmed, so Matt's own
// browsing is flagged and left out of the stats.
export function markAdminBrowser() {
  write(ADMIN, '1');
}
