-- ══════════════════════════════════════════════════════════════════
-- Prolifier — Performance indexes
-- Run once in Supabase Dashboard → SQL Editor
-- Each index dramatically reduces Disk IO by eliminating table scans
-- ══════════════════════════════════════════════════════════════════

-- ── notifications ─────────────────────────────────────────────────
-- Queried by: user_id + read (badge counts every 30s per user)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_id, read)
  WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_type_read
  ON notifications(user_id, type, read);

-- ── connections ───────────────────────────────────────────────────
-- Queried by: receiver_id + status (discover badge count)
CREATE INDEX IF NOT EXISTS idx_connections_receiver_status
  ON connections(receiver_id, status);

CREATE INDEX IF NOT EXISTS idx_connections_requester
  ON connections(requester_id);

-- ── posts ─────────────────────────────────────────────────────────
-- Queried by: created_at DESC (feed pagination), user_id (profile)
CREATE INDEX IF NOT EXISTS idx_posts_created_at
  ON posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_user_id
  ON posts(user_id);

-- ── collabs ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_collabs_created_at
  ON collabs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collabs_user_id
  ON collabs(user_id);

-- ── post_likes ────────────────────────────────────────────────────
-- Queried by: user_id (what posts you liked), post_id (like counts)
CREATE INDEX IF NOT EXISTS idx_post_likes_user
  ON post_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_post_likes_post
  ON post_likes(post_id);

-- ── comments ─────────────────────────────────────────────────────
-- Queried by: post_id (load comments for a post)
CREATE INDEX IF NOT EXISTS idx_comments_post_id
  ON comments(post_id);

CREATE INDEX IF NOT EXISTS idx_comments_user_id
  ON comments(user_id);

-- ── messages ─────────────────────────────────────────────────────
-- Queried by: sender_id, receiver_id (inbox + conversation load)
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON messages(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_receiver
  ON messages(receiver_id, created_at DESC);

-- ── blocks ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_blocks_blocker
  ON blocks(blocker_id);

CREATE INDEX IF NOT EXISTS idx_blocks_blocked
  ON blocks(blocked_id);

-- ── profiles ─────────────────────────────────────────────────────
-- Queried by: deleted_at (soft-deletion polling), name (mention search)
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON profiles(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Trigram index for fast ILIKE name search (mentions autocomplete)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm
  ON profiles USING gin(name gin_trgm_ops);

-- ── saved_posts / saved_collabs ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_saved_posts_user
  ON saved_posts(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_collabs_user
  ON saved_collabs(user_id);
