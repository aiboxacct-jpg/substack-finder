-- Creator-submitted newsletters. Everything is accessed server-side with the
-- service key (which bypasses RLS), so RLS is ON with no policies: the browser
-- can neither read nor write this table directly. Submissions start as
-- 'pending' and only appear in searches once the admin sets them to 'approved'.

create table if not exists public.submissions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  url         text not null,
  description text not null,
  tags        text default '',
  status      text not null default 'pending',  -- pending | approved | rejected
  created_at  timestamptz not null default now()
);

alter table public.submissions enable row level security;

-- Helpful for the "approved submissions for a topic" lookup on each search.
create index if not exists submissions_status_idx on public.submissions (status);
