-- 004_soft_delete.sql
-- Adds a soft-delete grace period to profiles.
-- When deleted_at is set the account is "scheduled for deletion".
-- After 7 days the client lazy-deletes all data on next login.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Partial index — only rows with a pending deletion need fast lookup.
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;
