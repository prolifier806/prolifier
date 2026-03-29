-- ============================================================
-- Migration 007 — Complete Blocking System
--
-- Why: The blocks table existed in production with no RLS,
-- no triggers, and all filtering done client-side in JS.
-- This migration adds:
--   1. Proper blocks table + RLS (if not already created)
--   2. Auto-remove connection on block
--   3. Auto-delete incoming notifications from blocked user
--   4. DB-enforced message send block (RLS on messages INSERT)
--   5. Helper RPC for bidirectional block check
-- ============================================================


-- ── 1. BLOCKS TABLE ───────────────────────────────────────────
-- The table may already exist in production. CREATE IF NOT EXISTS
-- is safe to re-run.

CREATE TABLE IF NOT EXISTS public.blocks (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  blocker_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  -- Prevent self-blocking
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

-- Enable RLS (idempotent — no error if already enabled)
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;


-- ── 2. RLS POLICIES ON BLOCKS ────────────────────────────────

-- Drop before recreating so the migration is idempotent
DROP POLICY IF EXISTS "blocks_select" ON public.blocks;
DROP POLICY IF EXISTS "blocks_insert" ON public.blocks;
DROP POLICY IF EXISTS "blocks_delete" ON public.blocks;

-- SELECT: You can see blocks you made OR blocks where you are the target.
-- The second clause is required so the UI can detect "you have been blocked"
-- (e.g. UserProfile.tsx hides the message button when blocked).
CREATE POLICY "blocks_select" ON public.blocks FOR SELECT
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

-- INSERT: You can only block as yourself.
CREATE POLICY "blocks_insert" ON public.blocks FOR INSERT
  WITH CHECK (blocker_id = auth.uid());

-- DELETE: You can only unblock blocks you created.
CREATE POLICY "blocks_delete" ON public.blocks FOR DELETE
  USING (blocker_id = auth.uid());


-- ── 3. HELPER FUNCTION: BIDIRECTIONAL BLOCK CHECK ─────────────
-- Returns TRUE if either user has blocked the other.
-- Used in RLS expressions below to avoid duplication.

CREATE OR REPLACE FUNCTION public.either_blocked(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;

GRANT EXECUTE ON FUNCTION public.either_blocked(uuid, uuid) TO authenticated;


-- ── 4. MESSAGES RLS: BLOCK SEND ──────────────────────────────
-- Replace the plain "sender can send" policy with one that also
-- prevents sending to/from a blocked user at the DB level.
-- This means even if JS is bypassed, no message can be inserted.

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

CREATE POLICY "Users can send messages" ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND NOT public.either_blocked(sender_id, receiver_id)
  );


-- ── 5. TRIGGER: AUTO-REMOVE CONNECTION ON BLOCK ───────────────
-- When A blocks B, any existing connection (pending or accepted)
-- between them is deleted immediately. This prevents the blocked
-- user appearing in A's connections list.

CREATE OR REPLACE FUNCTION public.remove_connection_on_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.connections
  WHERE
    (requester_id = NEW.blocker_id AND receiver_id  = NEW.blocked_id)
    OR
    (requester_id = NEW.blocked_id AND receiver_id  = NEW.blocker_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remove_connection_on_block ON public.blocks;
CREATE TRIGGER trg_remove_connection_on_block
  AFTER INSERT ON public.blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_connection_on_block();


-- ── 6. TRIGGER: CLEAN UP NOTIFICATIONS ON BLOCK ───────────────
-- When A blocks B, delete any unread notifications that B sent to A.
-- This stops harassment via notification spam after being blocked.
-- Cleans notifications of type: comment, like, connection, match.
-- Does NOT delete system notifications (no actor involved).

CREATE OR REPLACE FUNCTION public.clean_notifications_on_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete unread notifications sent TO the blocker FROM the blocked user.
  -- We identify actor by matching the action field or subtext containing
  -- the blocked user's name, but that's fragile. Instead we rely on a
  -- dedicated actor_id column if it exists, or we delete by actor_id.
  --
  -- Since the notifications table currently has no actor_id column, we
  -- do a best-effort delete: remove notifications where the action field
  -- references the blocked user (message: and profile: prefixed actions).
  DELETE FROM public.notifications
  WHERE
    user_id = NEW.blocker_id
    AND read = false
    AND (
      action = 'message:' || NEW.blocked_id::text
      OR action = 'profile:' || NEW.blocked_id::text
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_notifications_on_block ON public.blocks;
CREATE TRIGGER trg_clean_notifications_on_block
  AFTER INSERT ON public.blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.clean_notifications_on_block();


-- ── 7. ADD actor_id TO NOTIFICATIONS FOR FULL ENFORCEMENT ─────
-- Add an optional actor_id column to notifications so future
-- notifications can be reliably attributed to the sender.
-- This enables precise notification cleanup on block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'actor_id'
  ) THEN
    ALTER TABLE public.notifications
      ADD COLUMN actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Index for fast lookup when cleaning up on block
CREATE INDEX IF NOT EXISTS idx_notifications_actor
  ON public.notifications (actor_id)
  WHERE actor_id IS NOT NULL;

-- Now upgrade the trigger to use actor_id when available
CREATE OR REPLACE FUNCTION public.clean_notifications_on_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE
    user_id = NEW.blocker_id
    AND read = false
    AND (
      -- Precise match via actor_id (populated by new notifications)
      actor_id = NEW.blocked_id
      -- Fallback: action-field match for older notifications
      OR action = 'message:' || NEW.blocked_id::text
      OR action = 'profile:'  || NEW.blocked_id::text
    );

  RETURN NEW;
END;
$$;


-- ── 8. INDEXES (supplement supabase_indexes.sql) ──────────────
-- These may already exist from the indexes migration. IF NOT EXISTS
-- makes them safe to re-run.

CREATE INDEX IF NOT EXISTS idx_blocks_blocker
  ON public.blocks (blocker_id);

CREATE INDEX IF NOT EXISTS idx_blocks_blocked
  ON public.blocks (blocked_id);

-- Composite index for the bidirectional lookup in either_blocked()
CREATE INDEX IF NOT EXISTS idx_blocks_pair
  ON public.blocks (LEAST(blocker_id, blocked_id), GREATEST(blocker_id, blocked_id));
