CREATE OR REPLACE FUNCTION public.send_room_message(_room_id uuid, _body text)
RETURNS public.room_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_internal
AS $$
DECLARE
  uid uuid := auth.uid();
  result public.room_messages;
  locked boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(btrim(_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'الرسالة غير صالحة'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = _room_id AND user_id = uid
  ) THEN RAISE EXCEPTION 'يجب دخول الغرفة أولًا'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.bans
    WHERE user_id = uid
      AND ((scope = 'global') OR (scope = 'room' AND room_id = _room_id))
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN RAISE EXCEPTION 'لا يمكنك الكتابة في الغرفة'; END IF;

  SELECT chat_locked INTO locked
  FROM public.rooms
  WHERE id = _room_id AND is_active AND NOT is_disabled;

  IF locked IS NULL THEN RAISE EXCEPTION 'الغرفة غير متاحة'; END IF;
  IF locked AND NOT app_internal.can_manage_room(_room_id, uid) THEN
    RAISE EXCEPTION 'الدردشة مغلقة';
  END IF;

  INSERT INTO public.room_messages (room_id, user_id, body, kind)
  VALUES (_room_id, uid, btrim(_body), 'text')
  RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.send_room_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_room_message(uuid, text) TO authenticated, service_role;