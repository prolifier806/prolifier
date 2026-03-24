-- 005_permanently_deleted.sql
-- Adds permanently_deleted tombstone column.
-- The cleanup function marks the profile as permanently_deleted (instead of
-- deleting the row) so the app can show a message if the user tries to log in.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permanently_deleted boolean DEFAULT false;

-- Updated cleanup function — deletes all user data, then marks profile as tombstone
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
      AND permanently_deleted = false
  LOOP
    DELETE FROM public.post_likes    WHERE user_id = uid;
    DELETE FROM public.comments      WHERE user_id = uid;
    DELETE FROM public.connections   WHERE requester_id = uid OR receiver_id = uid;
    DELETE FROM public.notifications WHERE user_id = uid;
    DELETE FROM public.messages      WHERE sender_id = uid OR receiver_id = uid;
    DELETE FROM public.posts         WHERE user_id = uid;
    DELETE FROM public.collabs       WHERE user_id = uid;

    -- Keep the row as a tombstone so the app can show a message on next login
    UPDATE public.profiles SET
      permanently_deleted = true,
      deleted_at          = null,
      name                = null,
      bio                 = null,
      avatar              = null,
      avatar_url          = null,
      location            = null,
      project             = null,
      skills              = '{}',
      looking_for         = '{}',
      roles               = '{}',
      github              = null,
      website             = null,
      twitter             = null
    WHERE id = uid;
  END LOOP;
END;
$$;

-- To schedule daily cleanup (run this after enabling pg_cron extension):
-- Dashboard → Database → Extensions → enable pg_cron, then run:
-- SELECT cron.schedule('delete-expired-accounts', '0 3 * * *', 'SELECT permanently_delete_expired_accounts()');
