-- Migration 029 — Enable realtime on profiles table
-- REPLICA IDENTITY FULL is required for Supabase postgres_changes subscriptions
-- with row-level filters (e.g. id=eq.<userId>) to fire UPDATE events correctly.
-- Without this, the ban watch in UserContext.tsx never receives events.

alter table public.profiles replica identity full;

-- Add profiles to the supabase_realtime publication if not already present
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
