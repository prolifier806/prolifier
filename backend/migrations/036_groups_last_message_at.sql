-- Migration 036 — Track last message timestamp on groups for activity badge
alter table public.groups
  add column if not exists last_message_at timestamptz;

-- Back-fill from existing messages
update public.groups g
set last_message_at = (
  select max(created_at) from public.group_messages
  where group_id = g.id and is_system = false
);

-- Trigger: keep last_message_at current on every new non-system message
create or replace function public.update_group_last_message_at()
returns trigger language plpgsql security definer as $$
begin
  if not new.is_system then
    update public.groups set last_message_at = new.created_at where id = new.group_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_group_last_message_at on public.group_messages;
create trigger trg_group_last_message_at
  after insert on public.group_messages
  for each row execute function public.update_group_last_message_at();
