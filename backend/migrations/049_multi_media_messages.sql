-- 049: Support multiple media URLs per message (collage / gallery)
-- Adds media_urls TEXT[] to messages and group_messages.
-- media_url is kept for backwards compat (single video, file, audio).
-- When media_urls has 2+ items the frontend renders a collage grid.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_urls TEXT[];

ALTER TABLE group_messages
  ADD COLUMN IF NOT EXISTS media_urls TEXT[];
