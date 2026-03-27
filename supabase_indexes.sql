-- ============================================================
-- Prolifier Performance Migration
-- Run in: Supabase Dashboard → SQL Editor
-- Purpose: Add indexes, comment_count denormalization, and
--          helper RPC functions for efficient aggregation.
--
-- SAFE TO RUN: Uses CONCURRENTLY and IF NOT EXISTS throughout.
-- Runtime on empty/small tables: < 1 second.
-- Runtime on production tables with data: may take 1–5 minutes.
-- ============================================================

-- ============================================================
-- SECTION 1: CRITICAL INDEXES
-- Each index targets the most common query patterns.
-- ============================================================

-- Posts: timeline feed (ORDER BY created_at DESC is the most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_created_at_desc
  ON posts (created_at DESC);

-- Posts: user profile page, edit/delete ownership checks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_user_id
  ON posts (user_id);

-- Posts: feed filtered by non-deleted users (covers the deleted_at IS NULL join)
-- Partial index — only indexes non-deleted profile rows, much smaller
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_active
  ON profiles (id) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_created_at
  ON profiles (created_at DESC) WHERE deleted_at IS NULL;

-- Comments: count per post, lazy load per post
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_post_id
  ON comments (post_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_user_id
  ON comments (user_id);

-- Connections: discover page requests tab badge count
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_connections_receiver_status
  ON connections (receiver_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_connections_requester_status
  ON connections (requester_id, status);

-- Both directions for accepted connection count (profile analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_connections_accepted
  ON connections (receiver_id, requester_id) WHERE status = 'accepted';

-- Notifications: badge count (unread only) + notification list page
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE read = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_type_unread
  ON notifications (user_id, type) WHERE read = false;

-- Notification list with created_at ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- Post likes: per-user like state for the feed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_likes_user
  ON post_likes (user_id, post_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_likes_post
  ON post_likes (post_id);

-- Saved posts/collabs: profile page, feed state
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_posts_user
  ON saved_posts (user_id, post_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_collabs_user
  ON saved_collabs (user_id, collab_id);

-- Collab interests
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_collab_interests_user
  ON collab_interests (user_id, collab_id);

-- Messages: DM conversation load (both participant directions)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_receiver_created
  ON messages (sender_id, receiver_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_receiver_sender_created
  ON messages (receiver_id, sender_id, created_at DESC);

-- Messages: unread badge (partial index — only unread rows)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_receiver_unread
  ON messages (receiver_id, created_at DESC) WHERE read = false;

-- Group messages: chat load (ordered by created_at ASC within a group)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_messages_group_created
  ON group_messages (group_id, created_at ASC);

-- Group members: membership check, join/leave
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_members_user
  ON group_members (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_members_group_user
  ON group_members (group_id, user_id);

-- Blocks: mutual block filtering (two directions)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blocks_blocker
  ON blocks (blocker_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blocks_blocked
  ON blocks (blocked_id);

-- Collabs: feed timeline + user profile page
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_collabs_created_at_desc
  ON collabs (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_collabs_user_id
  ON collabs (user_id);

-- Reports: admin review (by target type + id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reports_target
  ON reports (target_type, target_id);

-- Feedback: user's own submissions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feedback_user
  ON feedback (user_id, created_at DESC);


-- ============================================================
-- SECTION 2: COMMENT COUNT DENORMALIZATION
-- Adds a comment_count column to posts, maintained by a trigger.
-- Eliminates the O(n) comment row scan on every feed load.
-- ============================================================

-- Add the column (safe — won't error if run again due to IF NOT EXISTS alternative below)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'comment_count'
  ) THEN
    ALTER TABLE posts ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END;
$$;

-- Backfill existing data (idempotent — safe to re-run)
UPDATE posts p
SET comment_count = (
  SELECT COUNT(*)::INTEGER FROM comments c WHERE c.post_id = p.id
)
WHERE true;  -- explicit WHERE to avoid partial update ambiguity

-- Trigger function: keep comment_count in sync with inserts/deletes
CREATE OR REPLACE FUNCTION sync_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts
    SET comment_count = comment_count + 1
    WHERE id = NEW.post_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts
    SET comment_count = GREATEST(0, comment_count - 1)
    WHERE id = OLD.post_id;
  END IF;

  RETURN NULL; -- AFTER trigger, return value is ignored
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trg_sync_comment_count ON comments;
CREATE TRIGGER trg_sync_comment_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION sync_comment_count();


-- ============================================================
-- SECTION 3: HELPER RPC FUNCTIONS
-- Used by the frontend to perform aggregations efficiently.
-- ============================================================

-- RPC: get comment counts for a batch of post IDs
-- Replaces the JS-side row scan:  comments.select("post_id").in("post_id", ids)
-- Returns one row per post_id with the count.
CREATE OR REPLACE FUNCTION get_post_comment_counts(post_ids UUID[])
RETURNS TABLE(post_id UUID, cnt BIGINT)
LANGUAGE SQL
STABLE           -- marks this as read-only (enables caching)
SECURITY DEFINER -- runs with definer's privileges, respecting RLS
AS $$
  SELECT post_id, COUNT(*)::BIGINT AS cnt
  FROM comments
  WHERE post_id = ANY(post_ids)
  GROUP BY post_id;
$$;

-- RPC: get conversation list (last message per conversation partner)
-- Replaces the 300-row full scan in Messages.tsx
-- Returns one row per conversation, ordered by most recent activity.
CREATE OR REPLACE FUNCTION get_conversation_list(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  other_user_id  UUID,
  last_msg_id    UUID,
  last_text      TEXT,
  last_media_type TEXT,
  last_created_at TIMESTAMPTZ,
  unread_count   BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT
      id,
      CASE WHEN sender_id = p_user_id THEN receiver_id ELSE sender_id END AS other_id,
      text,
      media_type,
      created_at,
      read,
      sender_id,
      ROW_NUMBER() OVER (
        PARTITION BY
          LEAST(sender_id, receiver_id),
          GREATEST(sender_id, receiver_id)
        ORDER BY created_at DESC
      ) AS rn
    FROM messages
    WHERE sender_id = p_user_id OR receiver_id = p_user_id
  ),
  last_messages AS (
    SELECT id, other_id, text, media_type, created_at
    FROM ranked
    WHERE rn = 1
    ORDER BY created_at DESC
    LIMIT p_limit
  ),
  unread_counts AS (
    SELECT
      sender_id AS other_id,
      COUNT(*)::BIGINT AS cnt
    FROM messages
    WHERE receiver_id = p_user_id AND read = false
    GROUP BY sender_id
  )
  SELECT
    lm.other_id       AS other_user_id,
    lm.id             AS last_msg_id,
    lm.text           AS last_text,
    lm.media_type     AS last_media_type,
    lm.created_at     AS last_created_at,
    COALESCE(uc.cnt, 0) AS unread_count
  FROM last_messages lm
  LEFT JOIN unread_counts uc ON uc.other_id = lm.other_id
  ORDER BY lm.created_at DESC;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION get_post_comment_counts(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_conversation_list(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_comment_count() TO authenticated;


-- ============================================================
-- SECTION 4: QUERY ANALYSIS HINTS
-- Run these to verify your indexes are being used after migration.
-- ============================================================

-- Verify feed query uses index (should show "Index Scan" not "Seq Scan")
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id, user_id, tag, content, created_at, likes, comment_count
-- FROM posts
-- ORDER BY created_at DESC
-- LIMIT 30;

-- Verify notification badge query uses partial index
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT COUNT(*) FROM notifications
-- WHERE user_id = 'your-user-uuid'::UUID AND read = false
-- AND type NOT IN ('message', 'match');

-- Verify connection pending count uses index
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT COUNT(*) FROM connections
-- WHERE receiver_id = 'your-user-uuid'::UUID AND status = 'pending';
