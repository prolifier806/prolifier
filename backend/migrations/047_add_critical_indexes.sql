-- 047_add_critical_indexes.sql
-- Adds missing indexes that were causing full table scans and Disk IO budget exhaustion.
-- Critical tables: messages, group_messages, notifications, group_members, posts.

-- DM messages: fetching conversations was scanning the entire table
CREATE INDEX IF NOT EXISTS idx_messages_sender_id   ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages(receiver_id);

-- Composite index for the common DM inbox query (all messages between two users, ordered)
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages(sender_id, receiver_id, created_at DESC);

-- Group messages: loading group chat was scanning entire table
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id
  ON public.group_messages(group_id);

-- Notifications: fetching a user's notifications was a full table scan
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications(user_id);

-- Group members: membership lookups and "groups I'm in" queries
CREATE INDEX IF NOT EXISTS idx_group_members_user_id
  ON public.group_members(user_id);

-- Composite for "is this user a member of this group" (point lookup)
CREATE INDEX IF NOT EXISTS idx_group_members_group_user
  ON public.group_members(group_id, user_id);

-- Posts: fetching a user's posts was scanning entire table
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);

-- Enable realtime on dm_message_reactions so both sides see reactions instantly.
-- REPLICA IDENTITY FULL is required so DELETE events include all columns
-- (without it payload.old only contains the primary key, losing message_id/emoji).
ALTER TABLE public.dm_message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dm_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_message_reactions;
  END IF;
END $$;
