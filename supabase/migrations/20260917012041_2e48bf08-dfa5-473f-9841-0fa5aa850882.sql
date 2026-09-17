GRANT INSERT ON public.room_messages TO authenticated;

DROP POLICY IF EXISTS "send room message" ON public.room_messages;
CREATE POLICY "send room message"
ON public.room_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND kind = 'text'
  AND length(btrim(body)) BETWEEN 1 AND 2000
  AND EXISTS (
    SELECT 1 FROM public.room_members rm
    WHERE rm.room_id = room_messages.room_id AND rm.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = room_messages.room_id
      AND r.is_active
      AND NOT r.is_disabled
      AND (NOT r.chat_locked OR r.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.room_moderators mod
        WHERE mod.room_id = r.id AND mod.user_id = auth.uid()
      ))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.bans b
    WHERE b.user_id = auth.uid()
      AND (b.scope = 'global' OR (b.scope = 'room' AND b.room_id = room_messages.room_id))
      AND (b.expires_at IS NULL OR b.expires_at > now())
  )
);

CREATE OR REPLACE FUNCTION public.send_room_message(_room_id uuid, _body text)
RETURNS public.room_messages
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE result public.room_messages;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(btrim(_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'الرسالة غير صالحة'; END IF;
  INSERT INTO public.room_messages (room_id, user_id, body, kind)
  VALUES (_room_id, auth.uid(), btrim(_body), 'text')
  RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.send_room_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_room_message(uuid, text) TO authenticated, service_role;