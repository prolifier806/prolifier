-- Migration 019 — Fix collab_interests SELECT policy
--
-- The table has an INSERT policy but no SELECT policy, so RLS blocks
-- all reads. This causes interestedCollabs to always load empty on
-- refresh, making the Interested button lose its state.

-- Allow users to read their own interest rows
drop policy if exists "Users can read own collab interests" on public.collab_interests;
create policy "Users can read own collab interests"
  on public.collab_interests for select
  using (auth.uid() = user_id);

-- Also allow the collab owner to see who is interested
drop policy if exists "Collab owners can read interests" on public.collab_interests;
create policy "Collab owners can read interests"
  on public.collab_interests for select
  using (
    exists (
      select 1 from public.collabs c
      where c.id = collab_id
        and c.user_id = auth.uid()
    )
  );

-- Allow users to delete (withdraw) their own interest
drop policy if exists "Users can delete own collab interests" on public.collab_interests;
create policy "Users can delete own collab interests"
  on public.collab_interests for delete
  using (auth.uid() = user_id);
