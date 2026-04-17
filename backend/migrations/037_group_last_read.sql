-- Migration 037 — Server-side read receipts for group chat
-- Replaces localStorage-only read tracking with a DB-backed table.

create table if not exists public.group_last_read (
  user_id    uuid not null references auth.users(id) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

-- Only the owning user can read/write their own row
alter table public.group_last_read enable row level security;

create policy "owner read"  on public.group_last_read for select using (auth.uid() = user_id);
create policy "owner upsert" on public.group_last_read for insert with check (auth.uid() = user_id);
create policy "owner update" on public.group_last_read for update using (auth.uid() = user_id);

-- Fast lookup: all unread counts for a user across all groups
create index if not exists idx_group_last_read_user on public.group_last_read(user_id);
