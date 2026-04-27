-- Add edit and unsent tracking to DM messages
alter table public.messages
  add column if not exists edited  boolean not null default false,
  add column if not exists unsent  boolean not null default false;
