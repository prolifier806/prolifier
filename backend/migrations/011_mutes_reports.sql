-- ============================================================
-- Migration 011 — Mutes and Reports
--
-- mutes: user A mutes user B → A gets no message count/notification from B
-- reports: user A reports user B for moderation review
-- ============================================================

-- ── Mutes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mutes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  muter_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (muter_id, muted_id)
);

ALTER TABLE public.mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own mutes" ON public.mutes;
DROP POLICY IF EXISTS "Users can read mutes targeting them" ON public.mutes;

CREATE POLICY "Users manage their own mutes" ON public.mutes
  USING  (auth.uid() = muter_id)
  WITH CHECK (auth.uid() = muter_id);

-- Allow sender to check if recipient has muted them (needed in sendMessage)
CREATE POLICY "Users can read mutes targeting them" ON public.mutes
  FOR SELECT USING (auth.uid() = muted_id);

-- ── Reports ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       text NOT NULL DEFAULT 'inappropriate',
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Reporters can insert and view their own reports
DROP POLICY IF EXISTS "Users can insert reports" ON public.reports;
DROP POLICY IF EXISTS "Users can view their own reports" ON public.reports;

CREATE POLICY "Users can insert reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view their own reports" ON public.reports
  FOR SELECT USING (auth.uid() = reporter_id);
