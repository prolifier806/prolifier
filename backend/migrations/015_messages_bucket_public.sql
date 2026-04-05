-- Migration 015 — Make messages storage bucket public
--
-- The messages bucket was created as private (public = false) which means
-- getPublicUrl() returns a non-functional URL. DM media (images, videos,
-- files, voice notes) needs publicly accessible URLs so recipients can
-- view them without signed-URL expiry issues.

update storage.buckets set public = true where id = 'messages';

-- Allow authenticated users to delete their own uploads
create policy "Users can delete own message media" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'messages'
    and auth.uid()::text = (storage.foldername(name))[2]
  );
