-- DoorMan: storage buckets for user-uploaded images.
--
-- Two public-read buckets (images are served straight from the CDN URL, like
-- the original app UploadFile URLs were):
--   avatars/{user_id}/...       profile pictures; a user writes only their folder
--   event-covers/{event_id}/... cover photos; only that event's managers write
--
-- 5MB cap and image-only MIME types at the bucket level; the client also
-- resizes before upload (data-layer PR).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('event-covers', 'event-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "public read images" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('avatars', 'event-covers'));

create policy "avatar write own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cover write by event manager" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-covers'
              and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and public.is_event_manager(((storage.foldername(name))[1])::uuid));

create policy "cover update by event manager" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-covers'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_event_manager(((storage.foldername(name))[1])::uuid));

create policy "cover delete by event manager" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-covers'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_event_manager(((storage.foldername(name))[1])::uuid));
