import { createClient } from '@supabase/supabase-js';
import { usesSharedCookie, createCookieStorage } from './sessionStorage';

// Browser-side Supabase client. Uses the PUBLISHABLE key (safe to expose) —
// row-level security in the database protects the data. Shared across all
// Stack Tools: point every tool at the same Supabase project and users get
// one login everywhere.
// Fall back to harmless placeholders if the env vars aren't set yet, so a
// missing key never crashes the whole page — auth just won't work until the
// real values are present (locally in .env.local, and in Vercel for the live site).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// On stacktools.site and its subdomains, keep the session in a cookie scoped to
// the whole domain so one login covers every tool. Everywhere else (including
// substackfinder.site, which is a different root domain and cannot read that
// cookie) fall through to the Supabase default of localStorage.
const useCookie =
  typeof window !== 'undefined' && usesSharedCookie(window.location.hostname);

export const supabase = createClient(
  url,
  key,
  useCookie ? { auth: { storage: createCookieStorage() } } : undefined
);
