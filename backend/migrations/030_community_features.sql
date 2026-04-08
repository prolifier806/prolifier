-- Migration 030 — Community feature enhancements
-- 1. is_system flag on group_messages (for join/leave/ban/unban events)
-- 2. group_join_requests table (for private community invite-link flow)

-- ── System messages ───────────────────────────────────────────────────────────
alter table public.group_messages
  add column if not exists is_system boolean not null default false;

-- ── Join requests (private communities) ──────────────────────────────────────
create table if not exists public.group_join_requests (
  id         uuid default gen_random_uuid() primary key,
  group_id   uuid references public.groups(id)    on delete cascade not null,
  user_id    uuid references public.profiles(id)  on delete cascade not null,
  status     text not null default 'pending'
               check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now(),
  unique(group_id, user_id)
);

alter table public.group_join_requests enable row level security;

-- Requester can see and create their own requests
create policy "Users can view own join requests"
  on public.group_join_requests for select
  using (auth.uid() = user_id);

create policy "Users can create join requests"
  on public.group_join_requests for insert
  with check (auth.uid() = user_id);
