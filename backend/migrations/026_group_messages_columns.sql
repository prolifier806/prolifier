-- Add missing columns to group_messages table
-- These columns are used by the Groups UI (edited, unsent flags, reply support)

alter table public.group_messages
  add column if not exists edited      boolean not null default false,
  add column if not exists unsent      boolean not null default false,
  add column if not exists deleted     boolean not null default false,
  add column if not exists reply_to_id uuid references public.group_messages(id) on delete set null;
