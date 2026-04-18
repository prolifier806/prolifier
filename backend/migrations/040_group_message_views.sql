-- Migration 040 — Group message view counts

alter table public.group_messages
  add column if not exists view_count integer not null default 0;

-- Atomically increment view_count for a batch of messages,
-- skipping messages sent by the viewer themselves.
create or replace function public.mark_group_messages_viewed(
  msg_ids  uuid[],
  viewer_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.group_messages
  set view_count = view_count + 1
  where id = any(msg_ids)
    and user_id != viewer_id;
end;
$$;
