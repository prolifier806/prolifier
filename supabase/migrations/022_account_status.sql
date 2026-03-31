-- Migration 022 — Account status (ban system)
-- Adds account_status column to profiles.
-- Set to 'banned' via Supabase dashboard to suspend a user.
-- Banned users see a suspension screen at every page load.

alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
    check (account_status in ('active', 'banned'));
