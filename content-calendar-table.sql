-- Live content calendar for the admin page (replaces the hard-coded Aug 1
-- snapshot). One row per Note, reply, or post: idea -> draft -> approved -> scheduled ->
-- live. RLS is ON with no policies, so the browser never touches this table
-- directly; reads and writes go through /api/admin/calendar (ADMIN_EMAIL gate)
-- using the service key.

create table if not exists public.content_calendar (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'note',   -- note | reply | post
  status         text not null default 'idea',   -- idea | draft | approved | scheduled | live
  title          text not null,                  -- short label shown in the list
  body           text,                           -- draft text (optional)
  link           text,                           -- live URL once posted
  campaign       text,                           -- utm_campaign tag, e.g. note-round3
  scheduled_for  date,                           -- planned publish day
  posted_at      timestamptz,                    -- when it actually went live
  notes          text,                           -- anything else (who approved, results)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.content_calendar enable row level security;

create index if not exists content_calendar_list_idx
  on public.content_calendar (status, scheduled_for, posted_at desc);

-- Carry over the old static snapshot so nothing is lost. Runs only if the
-- table is empty, so pasting this file twice doesn't duplicate rows.
insert into public.content_calendar (kind, status, title, link, posted_at, notes)
select * from (values
  ('post', 'live', 'Meet Substack Finder — a matching system for newsletter writers',
     'https://stacktools.substack.com/p/meet-substack-finder-a-matching-system',
     timestamptz '2026-07-19 12:00-07', 'Tool Spotlight'),
  ('post', 'live', 'I built a headline tool. Then I caught it inventing my success.',
     'https://stacktools.substack.com/p/i-built-a-headline-tool-then-i-caught',
     timestamptz '2026-07-26 12:00-07', 'Freeform'),
  ('note', 'live', 'Note 2 — the near-miss link lesson', null,
     timestamptz '2026-07-23 12:00-07', 'build-in-public'),
  ('note', 'live', 'Future-tools teaser — reader vote', null,
     timestamptz '2026-07-26 12:00-07', 'Roast / Pricing / Battle'),
  ('note', 'live', 'Note 3 — clean promo', null,
     timestamptz '2026-08-01 12:00-07', 'Finder promo'),
  ('note', 'live', 'Note 4 — the headline-tool hallucination', null,
     timestamptz '2026-08-26 12:00-07', 'from Post #8'),
  ('post', 'idea', 'How writer-matching on Stack Tools will work', null, null, 'Tool Spotlight · progress update'),
  ('post', 'idea', 'Why I''m building tools for newsletter writers', null, null, 'Freeform · founder story'),
  ('post', 'idea', 'Free tool teardown: what makes a "simple newsletter tool" worth building', null, null, 'Freeform · educational'),
  ('post', 'idea', 'Everything I got wrong building Stack Tools so far', null, null, 'Freeform · retrospective')
) as seed(kind, status, title, link, posted_at, notes)
where not exists (select 1 from public.content_calendar);
