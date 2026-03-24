-- ============================================================
-- Unified skill system + role field
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Add roles column to profiles (user's role: Founder, Builder, etc.)
alter table public.profiles
  add column if not exists roles text[] default '{}';

-- Add avatar_url column if not added yet (may have been done manually)
alter table public.profiles
  add column if not exists avatar_url text;

-- Add profile_complete column if not added yet
alter table public.profiles
  add column if not exists profile_complete boolean default false;
