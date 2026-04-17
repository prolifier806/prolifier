-- Migration 039 — Full-text search for group and DM messages

-- ── Group messages ────────────────────────────────────────────────────────────
alter table public.group_messages
  add column if not exists search_vector tsvector
    generated always as (to_tsvector('english', coalesce(text, ''))) stored;

create index if not exists idx_group_messages_search
  on public.group_messages using gin(search_vector);

-- ── Direct messages ────────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists search_vector tsvector
    generated always as (to_tsvector('english', coalesce(text, ''))) stored;

create index if not exists idx_messages_search
  on public.messages using gin(search_vector);
