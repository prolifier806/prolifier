-- Migration 038 — Emoji reactions on group messages
create table if not exists public.group_message_reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.group_messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (char_length(emoji) <= 8),
  created_at  timestamptz not null default now(),
  unique(message_id, user_id, emoji)
);

-- Index for fast per-message reaction lookups
create index if not exists idx_gmr_message_id on public.group_message_reactions(message_id);

-- RLS
alter table public.group_message_reactions enable row level security;

-- Anyone who can read the message's group can read reactions
create policy "reactions_select" on public.group_message_reactions
  for select using (true);

-- Authenticated users can insert their own reactions
create policy "reactions_insert" on public.group_message_reactions
  for insert with check (auth.uid() = user_id);

-- Users can only delete their own reactions
create policy "reactions_delete" on public.group_message_reactions
  for delete using (auth.uid() = user_id);
