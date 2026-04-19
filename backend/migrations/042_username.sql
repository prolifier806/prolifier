-- Migration 042 — Global username system
-- Adds a unique, lowercase username to every profile.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

-- Case-insensitive uniqueness: store always lowercase, enforce uniqueness normally.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_unique UNIQUE (username);

-- Fast lookup by username (used for availability check + mention autocomplete)
CREATE INDEX IF NOT EXISTS idx_profiles_username
  ON public.profiles (username);

-- Auto-generate safe temp usernames for existing rows that have none.
-- Pattern: user + first 8 hex chars of the UUID (collision-safe, deterministic).
UPDATE public.profiles
  SET username = 'user' || lower(replace(left(id::text, 8), '-', ''))
  WHERE username IS NULL;
