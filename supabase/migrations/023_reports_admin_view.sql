-- Migration 023 — Reports: add missing columns + admin visibility
-- Works regardless of which columns already exist in the live reports table.

-- Core columns that may be missing
alter table public.reports
  add column if not exists status        text    not null default 'pending';
alter table public.reports
  add column if not exists content_type  text;
alter table public.reports
  add column if not exists content_id    uuid;
alter table public.reports
  add column if not exists reported_id   uuid;
alter table public.reports
  add column if not exists details       text;
alter table public.reports
  add column if not exists content_snapshot text;
alter table public.reports
  add column if not exists reporter_name text;

-- Admin SELECT policy
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

-- Admin convenience view — uses coalesce so it works whether the table
-- uses content_id (post/comment reports) or reported_id (user reports)
create or replace view public.reports_admin_view as
select
  r.id,
  r.created_at,
  r.status,
  r.reason,
  r.details,
  r.content_snapshot,
  r.content_type,
  r.content_id,
  r.reported_id,
  r.reporter_id,
  r.reporter_name,
  rp.name  as reporter_display_name,
  tp.name  as reported_user_name
from public.reports r
left join public.profiles rp on rp.id = r.reporter_id
left join public.profiles tp on tp.id = r.reported_id;

grant select on public.reports_admin_view to authenticated;
