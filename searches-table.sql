-- Logs each match search (the Substack a visitor pasted in) so the admin
-- dashboard can show which Substacks are trying to match. Written server-side
-- with the service key, so RLS is ON with no policies (browser has no access).

create table if not exists public.searches (
  id          uuid primary key default gen_random_uuid(),
  topic       text not null,          -- the Substack the visitor pasted in
  email       text,                   -- the logged-in user's email, or null if anonymous
  created_at  timestamptz not null default now()
);

alter table public.searches enable row level security;

create index if not exists searches_created_idx on public.searches (created_at desc);
