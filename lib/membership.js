import { createClient } from '@supabase/supabase-js';

// Shared account helpers for every Stack Tools tool. One Supabase project backs
// the whole suite, so "who is this and are they a member?" is answered the same
// way everywhere — a tool only has to call getMembership().

// Figure out who's calling and whether they're a paying member.
// Returns { user: null, isMember: false } for anonymous or invalid tokens —
// it never throws, so a Supabase hiccup degrades to "treat them as free".
export async function getMembership(token) {
  if (!token) return { user: null, isMember: false };
  try {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const {
      data: { user },
    } = await anon.auth.getUser(token);
    if (!user) return { user: null, isMember: false };

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data } = await admin
      .from('profiles')
      .select('is_subscribed')
      .eq('id', user.id)
      .single();
    return { user, isMember: !!data?.is_subscribed };
  } catch {
    return { user: null, isMember: false };
  }
}

// Record one tool run in the shared `searches` table so the admin dashboard can
// show what people are using. Fire-and-forget: a logging hiccup must never
// break an actual request.
//
// Returns the new row's id so the outcome can be filled in once the run
// finishes (see recordOutcome). Returns null if logging failed, which callers
// must tolerate.
//
// The `tool` column was added after launch (see searches-tool-column.sql). If
// that migration hasn't been run yet, the first insert fails on the unknown
// column and we quietly retry without it, so logging keeps working either way.
export async function logToolRun(topic, email, tool = 'finder') {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const row = { topic, email: email || null };
    let res = await admin.from('searches').insert({ ...row, tool }).select('id').single();
    if (res.error) res = await admin.from('searches').insert(row).select('id').single();
    return res.data?.id ?? null;
  } catch {
    // logging is best-effort
    return null;
  }
}

// Fill in how a run turned out. Deliberately written as a SECOND step rather
// than logging once at the end: a request that crashes or times out then leaves
// a row with a null outcome, which is itself the useful signal that it never
// finished. Logging only on success would hide exactly the runs worth seeing.
//
// No-ops harmlessly until searches-outcome-columns.sql has been run.
export async function recordOutcome(id, outcome, resultCount = null) {
  if (!id) return;
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await admin
      .from('searches')
      .update({ outcome, result_count: resultCount })
      .eq('id', id);
  } catch {
    // best-effort
  }
}
