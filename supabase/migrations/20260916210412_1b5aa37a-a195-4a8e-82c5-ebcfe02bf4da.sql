CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.public_id IS DISTINCT FROM OLD.public_id
     OR NEW.level IS DISTINCT FROM OLD.level OR NEW.xp IS DISTINCT FROM OLD.xp
     OR NEW.vip_level IS DISTINCT FROM OLD.vip_level OR NEW.is_cvip IS DISTINCT FROM OLD.is_cvip
     OR NEW.cvip_expires_at IS DISTINCT FROM OLD.cvip_expires_at OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
     OR NEW.is_online IS DISTINCT FROM OLD.is_online OR NEW.last_seen IS DISTINCT FROM OLD.last_seen
     OR NEW.frame_url IS DISTINCT FROM OLD.frame_url OR NEW.profile_background_url IS DISTINCT FROM OLD.profile_background_url THEN
    RAISE EXCEPTION 'لا يمكنك تعديل حقول الحساب المحمية';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_profile_sensitive_fields_trigger ON public.profiles;
CREATE TRIGGER guard_profile_sensitive_fields_trigger BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_sensitive_fields();

REVOKE UPDATE ON public.user_items FROM authenticated;
DROP POLICY IF EXISTS "equip own items" ON public.user_items;

DROP POLICY IF EXISTS "update room mics" ON public.room_mics;
DROP POLICY IF EXISTS "manage room mics" ON public.room_mics;
CREATE POLICY "room managers update mics" ON public.room_mics FOR UPDATE TO authenticated
USING (public.can_manage_room(room_id, auth.uid()))
WITH CHECK (public.can_manage_room(room_id, auth.uid()));

DROP POLICY IF EXISTS "send room message" ON public.room_messages;
CREATE OR REPLACE FUNCTION public.send_room_message(_room_id UUID, _body TEXT)
RETURNS public.room_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); result public.room_messages; locked BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(btrim(_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'الرسالة غير صالحة'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.room_members WHERE room_id = _room_id AND user_id = uid) THEN RAISE EXCEPTION 'يجب دخول الغرفة أولًا'; END IF;
  IF EXISTS (SELECT 1 FROM public.bans WHERE user_id = uid AND ((scope = 'global') OR (scope = 'room' AND room_id = _room_id)) AND (expires_at IS NULL OR expires_at > now())) THEN RAISE EXCEPTION 'لا يمكنك الكتابة في الغرفة'; END IF;
  SELECT chat_locked INTO locked FROM public.rooms WHERE id = _room_id AND is_active AND NOT is_disabled;
  IF locked IS NULL THEN RAISE EXCEPTION 'الغرفة غير متاحة'; END IF;
  IF locked AND NOT public.can_manage_room(_room_id, uid) THEN RAISE EXCEPTION 'الدردشة مغلقة'; END IF;
  INSERT INTO public.room_messages (room_id, user_id, body, kind) VALUES (_room_id, uid, btrim(_body), 'text') RETURNING * INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.send_room_message(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_room_message(UUID, TEXT) TO authenticated;

REVOKE INSERT ON public.room_messages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rooms FROM authenticated;

DROP POLICY IF EXISTS "bans viewable" ON public.bans;
CREATE POLICY "relevant bans viewable" ON public.bans FOR SELECT TO authenticated
USING (user_id = auth.uid() OR created_by = auth.uid() OR public.is_admin(auth.uid()) OR (room_id IS NOT NULL AND public.can_manage_room(room_id, auth.uid())));

DROP POLICY IF EXISTS "gift tx viewable" ON public.gift_transactions;
CREATE POLICY "relevant gift tx viewable" ON public.gift_transactions FOR SELECT TO authenticated
USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR (room_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.room_members rm WHERE rm.room_id = gift_transactions.room_id AND rm.user_id = auth.uid())) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "update received dm" ON public.direct_messages;
DROP POLICY IF EXISTS "mark dm read" ON public.direct_messages;
REVOKE UPDATE ON public.direct_messages FROM authenticated;
CREATE OR REPLACE FUNCTION public.mark_direct_messages_read(_sender_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.direct_messages SET read_at = now()
  WHERE sender_id = _sender_id AND receiver_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END; $$;
REVOKE ALL ON FUNCTION public.mark_direct_messages_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_direct_messages_read(UUID) TO authenticated;

DROP POLICY IF EXISTS "create notifications" ON public.notifications;
DROP POLICY IF EXISTS "insert notifications" ON public.notifications;
REVOKE INSERT ON public.notifications FROM authenticated;