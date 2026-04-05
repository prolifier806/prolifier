-- Migration 016 — Hidden conversations
--
-- When a user deletes a chat, we can only delete their own sent messages
-- (RLS prevents deleting the other person's messages). This table records
-- which conversations a user has hidden so fetchConversations can filter
-- them out even after refresh. When the other person sends a new message,
-- the hidden record is removed so the chat reappears naturally.

create table if not exists public.hidden_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  other_id    uuid not null references public.profiles(id) on delete cascade,
  hidden_at   timestamptz not null default now(),
  unique (user_id, other_id)
);

alter table public.hidden_conversations enable row level security;

create policy "Users manage own hidden conversations"
  on public.hidden_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
