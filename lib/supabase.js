import { createClient } from '@supabase/supabase-js';

// Browser-side Supabase client. Uses the PUBLISHABLE key (safe to expose) —
// row-level security in the database protects the data. Shared across all
// Stack Tools: point every tool at the same Supabase project and users get
// one login everywhere.
// Fall back to harmless placeholders if the env vars aren't set yet, so a
// missing key never crashes the whole page — auth just won't work until the
// real values are present (locally in .env.local, and in Vercel for the live site).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(url, key);
