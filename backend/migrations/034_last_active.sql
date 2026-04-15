-- Migration 034 — Last active timestamp on profiles
-- Used to display "Active today / Active this week" in chat header.

alter table public.profiles
  add column if not exists last_active timestamptz default now();

-- Index for cheap range queries (e.g. last 7 days)
create index if not exists profiles_last_active_idx on public.profiles (last_active);
