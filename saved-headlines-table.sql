-- Members can save a headline analysis and come back to it later.
-- Mirrors the existing saved_searches table: owned by the user, protected by
-- row-level security so the browser can only ever see its own rows.

create table if not exists public.saved_headlines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  headline    text not null,          -- the headline that was analysed
  context     text,                   -- the optional "what's the post about"
  score       integer,                -- the 0-100 score, so the list can show it
  result      jsonb,                  -- the full analysis (verdict, breakdown, rewrites)
  created_at  timestamptz not null default now()
);

alter table public.saved_headlines enable row level security;

drop policy if exists "Users manage their own saved headlines" on public.saved_headlines;
create policy "Users manage their own saved headlines"
  on public.saved_headlines
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists saved_headlines_user_idx
  on public.saved_headlines (user_id, created_at desc);
