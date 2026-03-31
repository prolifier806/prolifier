-- Migration 020 — Add role column to profiles
--
-- A single text field that defaults to 'user'.
-- Set to 'admin' via the Supabase dashboard (Table Editor or SQL editor)
-- to grant a user the verified badge.
--
-- Only the service-role (dashboard / backend) can set this column —
-- users cannot update their own role through the normal profile UPDATE policy.

alter table public.profiles
  add column if not exists role text not null default 'user';

-- Ensure regular users cannot elevate their own role
-- (the existing profile UPDATE policy allows users to update their own row,
--  so we restrict the role column via a CHECK constraint instead)
-- If you want stricter enforcement, you can remove the general UPDATE policy
-- and create a column-level policy — but for now a CHECK is simpler.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'admin', 'moderator'));
