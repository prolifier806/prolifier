-- Migration 014 — Add connections to Supabase Realtime publication
--
-- Without this, postgres_changes events on the connections table are never
-- sent to clients. This means:
--   • Discover badge for new connection requests never increments in real-time
--   • Discover → People tab connection state (pending/connected) never
--     updates live when the other user accepts/declines
--
-- notifications, messages, posts are already in the publication (migration 001).

alter publication supabase_realtime add table public.connections;
