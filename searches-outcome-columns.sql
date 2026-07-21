-- Records HOW each tool run turned out, not just what was submitted.
--
-- Without this the admin log shows the input but not whether it worked, so
-- diagnosing a user report means inferring failures from timestamps. Added
-- after the first real bug report, where three Finder runs were logged and
-- there was no way to see which of them actually failed.
--
-- Safe to run more than once. Existing rows keep a null outcome, meaning
-- "logged before this column existed".
--
-- outcome values:
--   ok        - worked first time
--   ok_retry  - worked, but only after the automatic retry
--   cached    - served from the 24h cache, no AI call
--   failed    - the AI never returned usable results
--   error     - the request threw (API down, no credit, timeout)
--   null      - never finished, or predates this column

alter table public.searches
  add column if not exists outcome text,
  add column if not exists result_count integer;

create index if not exists searches_outcome_idx on public.searches (outcome, created_at desc);
