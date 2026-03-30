-- Migration 013 — Add read flag to connection requests
--
-- Allows the discover badge to track whether the receiver has
-- already seen a pending request. Opening the Requests tab
-- marks all pending connections as read → badge stays 0 on refetch.

ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;

-- Index for the badge query (receiver_id + status + read)
CREATE INDEX IF NOT EXISTS connections_receiver_unread
  ON public.connections (receiver_id, status, read)
  WHERE status = 'pending' AND read = false;
