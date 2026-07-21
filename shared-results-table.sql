-- Snapshots of a match result set, so they can be shared with someone who did
-- not run the search themselves.
--
-- Why this exists: the "Copy link" button shares the QUERY (?topic=...), which
-- re-runs the whole search on the recipient's side. That costs another AI call,
-- counts against their daily limit, and can return different matches because
-- the model is not deterministic. This table stores the actual results, so a
-- shared link shows the same six matches, instantly and for free.
--
-- Access model: RLS is ON with NO policies, so the browser can never read this
-- table directly. The share page reads it server-side with the service key and
-- renders it. Knowing the (random uuid) id is what grants access, so treat a
-- share link as unlisted rather than private.

create table if not exists public.shared_results (
  id          uuid primary key default gen_random_uuid(),
  topic       text not null,          -- the Substack the matches were generated for
  results     jsonb not null,         -- the match cards, exactly as they were shown
  created_at  timestamptz not null default now()
);

alter table public.shared_results enable row level security;

create index if not exists shared_results_created_idx
  on public.shared_results (created_at desc);
