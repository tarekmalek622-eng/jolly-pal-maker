CREATE POLICY "app images readable by authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('avatars','rooms'));
CREATE POLICY "users upload own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('avatars','rooms') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users update own files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('avatars','rooms') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users delete own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('avatars','rooms') AND (storage.foldername(name))[1] = auth.uid()::text);