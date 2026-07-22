-- Durable free-tier rate limiting.
--
-- Why: the limits were held in memory, so every deploy wiped them and each
-- Vercel instance kept its own count. On a day with a dozen deploys the free
-- limit was closer to a suggestion. Rows here survive deploys and are shared
-- across instances.
--
-- One row per run. The check counts rows inside the window, so no counters to
-- keep in sync. Old rows are pruned opportunistically.
--
-- Privacy: `identity` is a Supabase user id for signed-in users, or a SALTED
-- HASH of the IP for anonymous ones. Raw IPs are never stored.

create table if not exists public.rate_limits (
  id          bigserial primary key,
  identity    text not null,
  tool        text not null,
  created_at  timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

create index if not exists rate_limits_lookup_idx
  on public.rate_limits (identity, tool, created_at desc);

-- Supports the pruning delete.
create index if not exists rate_limits_created_idx
  on public.rate_limits (created_at);
