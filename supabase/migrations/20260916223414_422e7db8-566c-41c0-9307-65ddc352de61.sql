CREATE POLICY "gift media readable by authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'gifts');
CREATE POLICY "gift media insert by admins" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'gifts' AND public.is_admin(auth.uid()));
CREATE POLICY "gift media update by admins" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'gifts' AND public.is_admin(auth.uid()));
CREATE POLICY "gift media delete by admins" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'gifts' AND public.is_admin(auth.uid()));