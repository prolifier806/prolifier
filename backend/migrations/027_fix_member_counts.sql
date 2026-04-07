-- Fix inflated member_count values caused by double-counting
-- (DB trigger + RPC calls were both incrementing the count)
-- Recompute all group member counts from the actual group_members rows.

update public.groups g
set member_count = (
  select count(*) from public.group_members gm where gm.group_id = g.id
);
