-- Adds a "tool" column to the shared searches log so the admin dashboard can
-- tell which Stack Tools tool each run came from (finder, headline, ...).
--
-- Safe to run more than once. Existing rows are all Substack Finder matches,
-- so they default to 'finder'.

alter table public.searches
  add column if not exists tool text not null default 'finder';

create index if not exists searches_tool_idx on public.searches (tool, created_at desc);
