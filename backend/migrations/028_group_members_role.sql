-- Add role column to group_members
-- Supports: "owner" | "admin" | "member"
alter table public.group_members
  add column if not exists role text not null default 'member';

-- Mark all current group owners as "owner" in group_members
update public.group_members gm
set role = 'owner'
from public.groups g
where gm.group_id = g.id and gm.user_id = g.owner_id;
