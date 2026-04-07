-- Group bans: persists permanently so banned users can't rejoin
CREATE TABLE IF NOT EXISTS group_bans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

-- Index for fast lookups on join
CREATE INDEX IF NOT EXISTS idx_group_bans_group_user ON group_bans(group_id, user_id);

-- RLS: only service role can read/write (backend uses supabaseAdmin)
ALTER TABLE group_bans ENABLE ROW LEVEL SECURITY;
