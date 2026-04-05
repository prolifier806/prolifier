-- ============================================================
-- Migration 006 — Denormalized comment_count on posts
--
-- Why: Feed.tsx was fetching every comment row for 30 posts
-- just to count them (up to 1,500 rows per page load).
-- A trigger-maintained counter eliminates that entirely.
-- ============================================================

-- 1. Add the column (safe on existing data)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

-- 2. Back-fill existing comment counts
UPDATE public.posts p
SET comment_count = (
  SELECT COUNT(*) FROM public.comments c WHERE c.post_id = p.id
);

-- 3. Trigger function — increments/decrements on comment insert/delete
CREATE OR REPLACE FUNCTION public.update_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 4. Attach trigger (replace if already exists from a prior run)
DROP TRIGGER IF EXISTS on_comment_change ON public.comments;
CREATE TRIGGER on_comment_change
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE PROCEDURE public.update_comment_count();
