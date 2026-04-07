-- ============================================================
-- Migration 025: group image_url column
-- WHY: Groups previously only had an emoji icon. Adding an optional
-- image_url lets owners upload a custom photo for the community,
-- consistent with modern messaging apps (Telegram, Discord, etc.)
-- ============================================================

ALTER TABLE groups ADD COLUMN IF NOT EXISTS image_url TEXT;
