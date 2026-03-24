-- 004_soft_delete.sql
-- Adds a soft-delete grace period to profiles.
-- When deleted_at is set the account is "scheduled for deletion".
-- After 7 days the client lazy-deletes all data on next login.
-- Posts remain visible during grace period but show "Deleted Account" as author.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Partial index — only rows with a pending deletion need fast lookup.
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Optional: server-side cleanup function for accounts that never log in again.
-- Requires pg_cron extension. Run cron.schedule() separately after enabling it.
CREATE OR REPLACE FUNCTION permanently_delete_expired_accounts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  uid uuid;
BEGIN
  FOR uid IN
    SELECT id FROM public.profiles
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - interval '7 days'
  LOOP
    DELETE FROM public.post_likes    WHERE user_id = uid;
    DELETE FROM public.comments      WHERE user_id = uid;
    DELETE FROM public.connections   WHERE requester_id = uid OR receiver_id = uid;
    DELETE FROM public.notifications WHERE user_id = uid;
    DELETE FROM public.messages      WHERE sender_id = uid OR receiver_id = uid;
    DELETE FROM public.posts         WHERE user_id = uid;
    DELETE FROM public.collabs       WHERE user_id = uid;
    DELETE FROM public.profiles      WHERE id = uid;
  END LOOP;
END;
$$;
