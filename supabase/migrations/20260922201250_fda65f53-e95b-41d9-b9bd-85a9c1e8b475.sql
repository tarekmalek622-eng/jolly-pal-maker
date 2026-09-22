create policy "voice upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-messages' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "voice read signed in" on storage.objects for select to authenticated
  using (bucket_id = 'voice-messages');
create policy "voice delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'voice-messages' and (storage.foldername(name))[1] = auth.uid()::text);