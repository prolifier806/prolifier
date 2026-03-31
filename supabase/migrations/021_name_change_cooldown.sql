-- Migration 021 — Name change cooldown
-- Tracks when a user last changed their display name so the app can
-- enforce a 7-day cooldown between name changes.

alter table public.profiles
  add column if not exists name_changed_at timestamptz;
