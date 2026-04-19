-- Migration 041 — DM message reactions
-- Mirrors group_message_reactions but for direct messages.

CREATE TABLE IF NOT EXISTS public.dm_message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       text NOT NULL CHECK (char_length(emoji) <= 8),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_dm_reactions_message
  ON public.dm_message_reactions (message_id);

ALTER TABLE public.dm_message_reactions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all reactions (backend validates ownership)
CREATE POLICY "users_read_dm_reactions" ON public.dm_message_reactions
  FOR SELECT TO authenticated USING (true);

-- Users can only manage their own reactions
CREATE POLICY "users_manage_own_dm_reactions" ON public.dm_message_reactions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
