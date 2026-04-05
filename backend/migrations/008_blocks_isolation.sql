-- ============================================================
-- Migration 008 — Total Block Isolation
--
-- Extends 007_blocks.sql to enforce full bidirectional isolation:
-- blocked users cannot comment, like, express collab interest,
-- send connection requests, or send notifications to each other.
-- Mirrors Instagram-style "these two users do not exist to each other".
--
-- Requires: either_blocked(uuid, uuid) from 007_blocks.sql
-- ============================================================


-- ── 1. NOTIFICATIONS: block from/to blocked users ─────────────
-- The previous policy allowed anyone to insert any notification.
-- Now: you cannot notify someone who has blocked you, and you
-- cannot notify someone you have blocked yourself.
-- auth.uid() = the actor (sender); user_id = the recipient.

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT
  WITH CHECK (
    -- actor must not be blocked by recipient, and must not have blocked recipient
    NOT public.either_blocked(auth.uid(), user_id)
  );


-- ── 2. COMMENTS: block commenting on each other's posts ────────
-- When either party has blocked the other, neither can comment
-- on the other's posts. Requires a subquery to find the post owner.

DROP POLICY IF EXISTS "Users can insert comments" ON public.comments;

CREATE POLICY "Users can insert comments" ON public.comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_id
        AND public.either_blocked(auth.uid(), p.user_id)
    )
  );


-- ── 3. POST LIKES: block liking each other's posts ────────────
-- Cannot like a post authored by someone you've blocked or who has blocked you.

DROP POLICY IF EXISTS "Users can like posts" ON public.post_likes;

CREATE POLICY "Users can like posts" ON public.post_likes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_id
        AND public.either_blocked(auth.uid(), p.user_id)
    )
  );


-- ── 4. CONNECTIONS: block sending requests to blocked users ────
-- Cannot send a connection request if either party has blocked the other.

DROP POLICY IF EXISTS "Users can send connection requests" ON public.connections;

CREATE POLICY "Users can send connection requests" ON public.connections FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND NOT public.either_blocked(requester_id, receiver_id)
  );


-- ── 5. COLLAB INTERESTS: block interest on blocked users' collabs
-- Cannot express interest in a collab owned by someone you've blocked
-- or who has blocked you.

DROP POLICY IF EXISTS "Users can express interest" ON public.collab_interests;
DROP POLICY IF EXISTS "Users can save collabs" ON public.collab_interests;

CREATE POLICY "Users can express collab interest" ON public.collab_interests FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.collabs c
      WHERE c.id = collab_id
        AND public.either_blocked(auth.uid(), c.user_id)
    )
  );


-- ── 6. MESSAGES SELECT: block reading messages from blocked users
-- Extends message visibility: you cannot read a conversation thread
-- if either party has since blocked the other.
-- NOTE: this only affects NEW reads — existing history is hidden
-- from the SELECT result once a block is in place.

DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;

CREATE POLICY "Users can view their own messages" ON public.messages FOR SELECT
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT public.either_blocked(sender_id, receiver_id)
  );
