-- Private buckets for invite selfies and avatars (Supabase Storage).
-- Files live under "<user id>/<file>"; the app serves them through signed URLs.
insert into storage.buckets (id, name, public)
values ('selfies', 'selfies', false), ('avatars', 'avatars', false)
on conflict (id) do nothing;

create policy "members upload into their folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('selfies', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "members manage their files" on storage.objects for delete to authenticated
  using (bucket_id in ('selfies', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "members read files" on storage.objects for select to authenticated
  using (bucket_id in ('selfies', 'avatars'));
