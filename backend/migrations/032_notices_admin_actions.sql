-- Migration 032 — Admin notices table + ensure admin_actions table exists

-- ── Notices ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  content     text NOT NULL,
  priority    text NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'archived')),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

-- Only admins/moderators can manage notices
CREATE POLICY "admins_manage_notices" ON public.notices
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- ── Admin actions log (ensure exists) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     text NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_actions" ON public.admin_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

CREATE POLICY "admins_insert_actions" ON public.admin_actions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Index for fast activity log queries
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at
  ON public.admin_actions (created_at DESC);
