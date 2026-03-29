-- ============================================================
-- Migration 010 — Remove block restriction from messages SELECT
--
-- Problem: Migration 009 added an RLS policy that prevented the
-- blocked user (B) from reading messages with the blocker (A).
-- This caused the entire conversation to disappear from B's inbox
-- because the messages fetch returned 0 rows.
--
-- Fix: Both parties can always READ message history.
-- Block only applies to INSERT (sending new messages) — already
-- enforced by the either_blocked() check in migration 007/008.
-- ============================================================

DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;

CREATE POLICY "Users can view their own messages" ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
