CREATE OR REPLACE FUNCTION public.send_friend_request(_addressee_id UUID)
RETURNS public.friend_requests
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); req public.friend_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _addressee_id = uid THEN RAISE EXCEPTION 'لا يمكنك إضافة نفسك'; END IF;
  IF EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = uid AND blocked_id = _addressee_id) OR (blocker_id = _addressee_id AND blocked_id = uid)) THEN
    RAISE EXCEPTION 'لا يمكن إرسال الطلب';
  END IF;
  IF EXISTS (SELECT 1 FROM public.friends WHERE user_id = uid AND friend_id = _addressee_id) THEN
    RAISE EXCEPTION 'أنتما صديقان بالفعل';
  END IF;
  INSERT INTO public.friend_requests (requester_id, addressee_id, status)
  VALUES (uid, _addressee_id, 'pending')
  ON CONFLICT (requester_id, addressee_id) DO UPDATE SET status = 'pending', created_at = now()
  RETURNING * INTO req;
  RETURN req;
END; $$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(_request_id UUID, _accept BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); changed UUID;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.friend_requests SET status = CASE WHEN _accept THEN 'accepted'::public.friend_status ELSE 'rejected'::public.friend_status END
  WHERE id = _request_id AND addressee_id = uid AND status = 'pending'
  RETURNING id INTO changed;
  IF changed IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_friend(_friend_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM public.friends WHERE user_id = uid AND friend_id = _friend_id;
  DELETE FROM public.friend_requests WHERE (requester_id = uid AND addressee_id = _friend_id) OR (requester_id = _friend_id AND addressee_id = uid);
  RETURN true;
END; $$;

DROP POLICY IF EXISTS "friend requests through secure functions" ON public.friend_requests;
DROP POLICY IF EXISTS "friend responses through secure functions" ON public.friend_requests;
CREATE POLICY "send valid friend request" ON public.friend_requests FOR INSERT TO authenticated
WITH CHECK (
  requester_id = auth.uid() AND requester_id <> addressee_id
  AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = auth.uid() AND b.blocked_id = addressee_id) OR (b.blocker_id = addressee_id AND b.blocked_id = auth.uid()))
);
CREATE POLICY "answer received friend request" ON public.friend_requests FOR UPDATE TO authenticated
USING (addressee_id = auth.uid()) WITH CHECK (addressee_id = auth.uid());

CREATE OR REPLACE FUNCTION public.sync_friend_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    VALUES (NEW.addressee_id, 'friend_request', 'طلب صداقة جديد', 'أرسل إليك مستخدم طلب صداقة', jsonb_build_object('request_id', NEW.id, 'requester_id', NEW.requester_id));
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.friends (user_id, friend_id) VALUES (NEW.requester_id, NEW.addressee_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.friends (user_id, friend_id) VALUES (NEW.addressee_id, NEW.requester_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    VALUES (NEW.requester_id, 'friend_accepted', 'تم قبول طلب الصداقة', 'أصبح لديكما اتصال صداقة', jsonb_build_object('friend_id', NEW.addressee_id));
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_friend_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_friend_request() TO service_role;
CREATE TRIGGER sync_friend_request_after_write AFTER INSERT OR UPDATE ON public.friend_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_friend_request();

CREATE OR REPLACE FUNCTION public.sync_friend_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.friends WHERE user_id = OLD.friend_id AND friend_id = OLD.user_id;
  RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.sync_friend_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_friend_delete() TO service_role;
CREATE TRIGGER sync_friend_delete_after_delete AFTER DELETE ON public.friends
FOR EACH ROW EXECUTE FUNCTION public.sync_friend_delete();