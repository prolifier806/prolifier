-- ============================================================
-- Migration 024: moderation_flags table
-- WHY: "flag"-severity content (heavy profanity, borderline language) was
-- previously computed server-side but never stored anywhere. Admins had no
-- way to review borderline submissions without writing custom DB queries.
-- This table gives the admin panel a feed of flagged content to review.
-- ============================================================

CREATE TABLE IF NOT EXISTS moderation_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type    TEXT NOT NULL CHECK (content_type IN ('post','comment','message','profile','collab','group_message')),
  content_id      UUID,                        -- NULL for profile bio/project updates
  flagged_text    TEXT NOT NULL,               -- capped at 500 chars in application layer
  category        TEXT NOT NULL,               -- e.g. "profanity", "threat", "slur"
  matched_pattern TEXT,                        -- the regex match that triggered the flag
  reviewed        BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by     UUID REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for admin review queue (unreviewed first, newest first)
CREATE INDEX IF NOT EXISTS idx_moderation_flags_unreviewed
  ON moderation_flags (reviewed, created_at DESC)
  WHERE reviewed = FALSE;

-- Index for looking up all flags for a specific user
CREATE INDEX IF NOT EXISTS idx_moderation_flags_user
  ON moderation_flags (user_id, created_at DESC);

-- Index for looking up flags by content
CREATE INDEX IF NOT EXISTS idx_moderation_flags_content
  ON moderation_flags (content_type, content_id)
  WHERE content_id IS NOT NULL;

-- RLS: only admins/moderators can read flags; the service_role key writes them
ALTER TABLE moderation_flags ENABLE ROW LEVEL SECURITY;

-- Admins and moderators can read all flags
CREATE POLICY "admins_read_flags" ON moderation_flags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- No direct client inserts — only the backend service_role key writes flags
-- (service_role bypasses RLS entirely)
