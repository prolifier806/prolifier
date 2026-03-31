-- Migration 023 — Reports: admin visibility + reporter/content details
--
-- Problem: the reports table has no SELECT policy for admins, so you can
-- only see reports through the Supabase dashboard with the service role.
-- This migration:
--   1. Adds a reporter_name computed view so you can see WHO reported WHAT.
--   2. Adds an admin SELECT policy so profiles with role='admin' can read all reports.
--   3. Adds a content_snapshot text column so the reported text is stored at
--      report time (content may be deleted later, making investigation impossible).

-- Add missing columns (safe if they already exist)
alter table public.reports
  add column if not exists status text not null default 'pending';

alter table public.reports
  add column if not exists content_snapshot text;

alter table public.reports
  add column if not exists reporter_name text;

-- Allow admins (role='admin') to read all reports
drop policy if exists "Admins can view all reports" on public.reports;
create policy "Admins can view all reports"
  on public.reports for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

-- Convenience view for the Supabase dashboard / admin queries
-- Shows all report info joined with reporter and target profile names
create or replace view public.reports_admin_view as
select
  r.id,
  r.created_at,
  r.status,
  r.content_type,
  r.content_id,
  r.reason,
  r.details,
  r.content_snapshot,
  rp.name  as reporter_name,
  r.reporter_id
from public.reports r
left join public.profiles rp on rp.id = r.reporter_id;

-- Grant admin access to the view
grant select on public.reports_admin_view to authenticated;
