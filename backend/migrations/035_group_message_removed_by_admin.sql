-- Migration 035 — Track admin-removed messages
alter table public.group_messages
  add column if not exists removed_by_admin boolean not null default false;
