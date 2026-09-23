DROP POLICY IF EXISTS "create notification" ON public.notifications;

REVOKE SELECT ON public.rooms FROM authenticated, anon;
GRANT SELECT (id,room_code,name,description,image_url,background_url,theme,category,room_type,mic_count,max_users,owner_id,is_active,is_disabled,member_count,popularity,chat_locked,created_at,updated_at,xp,is_verified,theme_style) ON public.rooms TO authenticated;

DROP POLICY IF EXISTS "voice read signed in" ON storage.objects;
CREATE POLICY "voice read participants" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'voice-messages' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.direct_messages dm
      WHERE dm.audio_url = 'voice-messages/' || storage.objects.name
        AND (dm.sender_id = auth.uid() OR dm.receiver_id = auth.uid())
    )
  )
);