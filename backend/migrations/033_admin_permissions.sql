-- Migration 033 — Admin permissions on group_members
-- Stores per-admin capability flags as a JSONB object.
-- Default NULL means "full legacy permissions" for existing admins.

alter table public.group_members
  add column if not exists permissions jsonb default null;

comment on column public.group_members.permissions is
  'Admin permission flags: {removeUsers, changeChannelInfo, banUsers, addSubscribers, manageMessages}. NULL = no restrictions (owner or legacy admin).';
