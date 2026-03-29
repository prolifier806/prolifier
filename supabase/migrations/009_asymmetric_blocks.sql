-- ============================================================
-- Migration 009 — Asymmetric Block: Messages SELECT Fix
--
-- Problem with 008: messages SELECT used either_blocked(), which
-- hid conversation history from BOTH parties. The blocker should
-- still be able to read old messages; only the blocked user loses
-- read access.
--
-- Rule:
--   Blocker (A blocks B) → can still read messages with B
--   Blocked (B, blocked by A) → cannot read messages with A
-- ============================================================

DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;

-- Only deny read access to the party who was blocked.
-- auth.uid() is the reader. The "other" participant is:
--   receiver_id when auth.uid() = sender_id, and vice versa.
-- Deny if: there exists a block where auth.uid() is the blocked_id
-- and the other participant is the blocker_id.
CREATE POLICY "Users can view their own messages" ON public.messages FOR SELECT
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE b.blocked_id = auth.uid()
        AND b.blocker_id = CASE
          WHEN auth.uid() = sender_id THEN receiver_id
          ELSE sender_id
        END
    )
  );
