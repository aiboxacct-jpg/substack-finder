-- Public feature-request board: visitors suggest ideas and upvote them, the
-- most-wanted rise to the top, and the admin marks items Shipped (shown
-- crossed out with a badge, like the old app this is modelled on).
--
-- One global list across all Stack Tools. RLS is ON with no policies, so the
-- browser never touches this table directly; all reads and writes go through
-- the API routes using the service key.

create table if not exists public.feature_requests (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,           -- the request itself, short
  votes       integer not null default 1,  -- starts at 1: suggesting counts as a vote
  status      text not null default 'open',  -- open | shipped
  email       text,                    -- who suggested it (if logged in); never shown publicly
  created_at  timestamptz not null default now()
);

alter table public.feature_requests enable row level security;

create index if not exists feature_requests_list_idx
  on public.feature_requests (status, votes desc);
