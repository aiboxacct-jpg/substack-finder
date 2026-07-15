-- "Email me these" groundwork: track which saved searches a member wants
-- emailed weekly, and when we last emailed each one (so we don't double-send).
-- Safe to run anytime; the feature stays hidden until we enable it.

alter table public.saved_searches
  add column if not exists email_optin boolean not null default false,
  add column if not exists last_emailed_at timestamptz;
