-- Manual "answered" marks for the admin Replies tab. One row per Substack
-- comment id. A row here overrides the automatic "did Stack Tools reply in
-- this thread?" check, in either direction (answered = true or false).
-- Deleting the row puts the comment back on auto-detection.
-- RLS is ON with no policies, so the browser never touches this table
-- directly; reads and writes go through /api/admin/replies (ADMIN_EMAIL gate)
-- using the service key.

create table if not exists public.reply_status (
  comment_id   text primary key,               -- Substack comment id, e.g. '388435627'
  answered     boolean not null default true,
  reply_url    text,                           -- link to our reply (optional)
  answered_at  timestamptz,                    -- when it was marked answered
  updated_at   timestamptz not null default now()
);

alter table public.reply_status enable row level security;
