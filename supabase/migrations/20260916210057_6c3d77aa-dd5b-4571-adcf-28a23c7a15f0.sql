CREATE OR REPLACE FUNCTION public.send_friend_request(_addressee_id UUID)
RETURNS public.friend_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); req public.friend_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _addressee_id = uid THEN RAISE EXCEPTION 'لا يمكنك إضافة نفسك'; END IF;
  IF EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = uid AND blocked_id = _addressee_id) OR (blocker_id = _addressee_id AND blocked_id = uid)) THEN
    RAISE EXCEPTION 'لا يمكن إرسال الطلب';
  END IF;
  IF EXISTS (SELECT 1 FROM public.friends WHERE (user_id = uid AND friend_id = _addressee_id) OR (user_id = _addressee_id AND friend_id = uid)) THEN
    RAISE EXCEPTION 'أنتما صديقان بالفعل';
  END IF;
  INSERT INTO public.friend_requests (requester_id, addressee_id, status)
  VALUES (uid, _addressee_id, 'pending')
  ON CONFLICT (requester_id, addressee_id) DO UPDATE SET status = 'pending', created_at = now()
  RETURNING * INTO req;
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (_addressee_id, 'friend_request', 'طلب صداقة جديد', 'أرسل إليك مستخدم طلب صداقة', jsonb_build_object('request_id', req.id, 'requester_id', uid));
  RETURN req;
END; $$;
REVOKE ALL ON FUNCTION public.send_friend_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_friend_request(_request_id UUID, _accept BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); req public.friend_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO req FROM public.friend_requests WHERE id = _request_id AND addressee_id = uid AND status = 'pending' FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF _accept THEN
    UPDATE public.friend_requests SET status = 'accepted' WHERE id = req.id;
    INSERT INTO public.friends (user_id, friend_id) VALUES (req.requester_id, req.addressee_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.friends (user_id, friend_id) VALUES (req.addressee_id, req.requester_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    VALUES (req.requester_id, 'friend_accepted', 'تم قبول طلب الصداقة', 'أصبح لديكما اتصال صداقة', jsonb_build_object('friend_id', uid));
  ELSE
    UPDATE public.friend_requests SET status = 'rejected' WHERE id = req.id;
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.respond_friend_request(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_friend(_friend_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM public.friends WHERE (user_id = uid AND friend_id = _friend_id) OR (user_id = _friend_id AND friend_id = uid);
  DELETE FROM public.friend_requests WHERE (requester_id = uid AND addressee_id = _friend_id) OR (requester_id = _friend_id AND addressee_id = uid);
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.remove_friend(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_friend(UUID) TO authenticated;

DROP POLICY IF EXISTS "send friend request" ON public.friend_requests;
DROP POLICY IF EXISTS "answer friend request" ON public.friend_requests;
CREATE POLICY "friend requests through secure functions" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "friend responses through secure functions" ON public.friend_requests FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "add friend row" ON public.friends;
CREATE POLICY "friend rows through secure functions" ON public.friends FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "send dm" ON public.direct_messages;
CREATE POLICY "send unblocked dm" ON public.direct_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND sender_id <> receiver_id
  AND length(btrim(body)) BETWEEN 1 AND 2000
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = receiver_id)
       OR (b.blocker_id = receiver_id AND b.blocked_id = auth.uid())
  )
);
GRANT DELETE ON public.direct_messages TO authenticated;
CREATE POLICY "delete own sent dm" ON public.direct_messages FOR DELETE TO authenticated USING (sender_id = auth.uid());

ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;