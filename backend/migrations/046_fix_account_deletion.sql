-- 046_fix_account_deletion.sql
-- Fixes account deletion to be immediate and fully clean.
-- Messages are intentionally preserved (sender shows as "Deleted Account").
-- Updates the cron cleanup function to properly purge auth.users so the
-- email becomes available for re-registration.

-- Update the server-side cleanup function used by pg_cron.
-- This handles accounts soft-deleted before the immediate-deletion change.
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
    -- Delete all user data except messages (preserved for conversation history)
    DELETE FROM public.post_likes             WHERE user_id = uid;
    DELETE FROM public.comments               WHERE user_id = uid;
    DELETE FROM public.connections            WHERE requester_id = uid OR receiver_id = uid;
    DELETE FROM public.notifications          WHERE user_id = uid;
    DELETE FROM public.blocks                 WHERE blocker_id = uid OR blocked_id = uid;
    DELETE FROM public.saved_posts            WHERE user_id = uid;
    DELETE FROM public.saved_collabs          WHERE user_id = uid;
    DELETE FROM public.collab_interests       WHERE user_id = uid;
    DELETE FROM public.group_members          WHERE user_id = uid;
    DELETE FROM public.group_join_requests    WHERE user_id = uid;
    DELETE FROM public.dm_message_reactions   WHERE user_id = uid;
    DELETE FROM public.group_message_reactions WHERE user_id = uid;
    DELETE FROM public.hidden_conversations   WHERE user_id = uid OR other_id = uid;
    DELETE FROM public.mutes                  WHERE muter_id = uid OR muted_id = uid;
    DELETE FROM public.posts                  WHERE user_id = uid;
    DELETE FROM public.collabs                WHERE user_id = uid;
    DELETE FROM public.profiles               WHERE id = uid;
    -- Delete from auth.users last to free the email for re-registration.
    DELETE FROM auth.users                    WHERE id = uid;
  END LOOP;
END;
$$;
