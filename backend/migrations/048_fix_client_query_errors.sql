-- ============================================================
-- Migration 048 — Fix client-side Supabase query errors
--
-- Two root causes:
--
-- 1. REALTIME: Layout.tsx subscribes to postgres_changes on
--    `connections` (INSERT + UPDATE) but that table was never
--    added to the supabase_realtime publication. Supabase throws
--    a subscription validation error, visible in the console as
--    "connections?receiver_id=eq.<uuid>" failures.
--
-- 2. GRANTS: Tables created via SQL migrations don't get the
--    automatic anon/authenticated grants that the Supabase
--    dashboard adds. Client-side queries (blocks, mutes, messages,
--    etc.) fail with 403 Permission Denied if the role doesn't
--    have SELECT on the table, even when RLS policies are correct.
--    GRANT is idempotent — safe to run even if already granted.
-- ============================================================

-- ── 1. Add connections to realtime publication ────────────────
-- Layout.tsx subscribes to INSERT and UPDATE on connections to
-- update the "pending requests" badge in real time.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'connections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;
  END IF;
END $$;

-- UPDATE events need REPLICA IDENTITY FULL so the old row is
-- available in the payload (needed to decrement the badge).
ALTER TABLE public.connections REPLICA IDENTITY FULL;

-- ── 2. Ensure authenticated role has SELECT on client-queried tables ──
-- These are all tables that the frontend queries directly via the
-- Supabase client (not through the backend API). GRANT is idempotent.

GRANT SELECT ON public.notifications   TO authenticated;
GRANT SELECT ON public.connections     TO authenticated;
GRANT SELECT ON public.group_members   TO authenticated;
GRANT SELECT ON public.blocks          TO authenticated;
GRANT SELECT ON public.mutes           TO authenticated;
GRANT SELECT ON public.messages        TO authenticated;
GRANT SELECT ON public.profiles        TO authenticated;
GRANT SELECT ON public.groups          TO authenticated;

-- Also ensure anon can't see private data (explicit deny via RLS is fine,
-- but we never want anon to query these tables at all)
REVOKE SELECT ON public.notifications  FROM anon;
REVOKE SELECT ON public.connections    FROM anon;
REVOKE SELECT ON public.blocks         FROM anon;
REVOKE SELECT ON public.mutes          FROM anon;
REVOKE SELECT ON public.messages       FROM anon;
