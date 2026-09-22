CREATE TABLE IF NOT EXISTS public.room_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stars smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_ratings TO authenticated;
GRANT ALL ON public.room_ratings TO service_role;

ALTER TABLE public.room_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone signed in reads ratings" ON public.room_ratings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own rating" ON public.room_ratings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND stars BETWEEN 1 AND 5);
CREATE POLICY "users update own rating" ON public.room_ratings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND stars BETWEEN 1 AND 5);
CREATE POLICY "users delete own rating" ON public.room_ratings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS room_ratings_room_idx ON public.room_ratings (room_id);

CREATE TRIGGER update_room_ratings_updated_at
  BEFORE UPDATE ON public.room_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS chat_locked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.send_room_message(_room_id uuid, _body text)
 RETURNS room_messages
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE result public.room_messages;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(btrim(_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'الرسالة غير صالحة'; END IF;
  IF EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = _room_id AND r.chat_locked)
     AND NOT public.can_manage_room(_room_id, auth.uid()) THEN
    RAISE EXCEPTION 'الدردشة مقفولة حاليًا';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.banned_words w
    WHERE lower(btrim(_body)) LIKE '%' || lower(w.word) || '%'
  ) THEN
    RAISE EXCEPTION 'الرسالة تحتوي كلمات محظورة';
  END IF;
  INSERT INTO public.room_messages (room_id, user_id, body, kind)
  VALUES (_room_id, auth.uid(), btrim(_body), 'text')
  RETURNING * INTO result;
  RETURN result;
END;
$function$;