-- Migration 012 — Multi-image posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT NULL;
