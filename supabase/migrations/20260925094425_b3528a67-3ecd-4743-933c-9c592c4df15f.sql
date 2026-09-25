CREATE OR REPLACE FUNCTION public.enter_room(_room_id uuid, _password text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r rooms%ROWTYPE;
BEGIN
  SELECT * INTO r FROM rooms WHERE id = _room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الغرفة غير موجودة'; END IF;
  IF r.is_disabled OR NOT r.is_active THEN RAISE EXCEPTION 'الغرفة غير متاحة الآن'; END IF;
  IF r.room_type = 'private'
     AND r.owner_id <> auth.uid()
     AND NOT app_internal.can_manage_room(r.id, auth.uid())
     AND (r.password IS NULL OR r.password <> COALESCE(_password, '')) THEN
    RAISE EXCEPTION 'كلمة سر الغرفة غير صحيحة';
  END IF;
  INSERT INTO room_members (room_id, user_id, joined_at)
  VALUES (_room_id, auth.uid(), now())
  ON CONFLICT (room_id, user_id) DO UPDATE SET joined_at = now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.enter_room(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enter_room(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "join room" ON public.room_members;
CREATE POLICY "join room" ON public.room_members FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND (
    EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_id AND r.room_type = 'public')
    OR app_internal.can_manage_room(room_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "room messages viewable" ON public.room_messages;
CREATE POLICY "room messages viewable" ON public.room_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_id AND r.room_type = 'public')
  OR app_internal.can_manage_room(room_id, auth.uid())
  OR EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = room_messages.room_id AND rm.user_id = auth.uid())
);

DROP POLICY IF EXISTS "send room message" ON public.room_messages;
CREATE POLICY "send room message" ON public.room_messages FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND (
    EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_id AND r.room_type = 'public')
    OR app_internal.can_manage_room(room_id, auth.uid())
    OR EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = room_messages.room_id AND rm.user_id = auth.uid())
  )
);