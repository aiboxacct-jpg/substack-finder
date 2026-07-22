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
  tool        text not null default 'general',  -- finder | headline | general (all tools)
  email       text,                    -- who suggested it (if logged in); never shown publicly
  created_at  timestamptz not null default now()
);

-- If the table was created before requests became per-tool, this adds the
-- column; on a fresh table it does nothing. Either way one paste is enough.
alter table public.feature_requests
  add column if not exists tool text not null default 'general';

alter table public.feature_requests enable row level security;

-- Named differently from the original (status, votes) index: "if not exists"
-- matches on the NAME, so reusing the old name would silently keep the old
-- definition on a table that ran the first version of this file.
create index if not exists feature_requests_tool_list_idx
  on public.feature_requests (tool, status, votes desc);
